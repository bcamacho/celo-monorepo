import { eqAddress, NULL_ADDRESS } from '@celo/base/lib/address'
import { concurrentMap, sleep } from '@celo/base/lib/async'
import { notEmpty, zip3 } from '@celo/base/lib/collections'
import { parseSolidityStringArray } from '@celo/base/lib/parsing'
import { appendPath } from '@celo/base/lib/string'
import { Address, toTransactionObject } from '@celo/connect'
import { AttestationUtils, SignatureUtils } from '@celo/utils/lib'
import { AttestationRequest, GetAttestationRequest } from '@celo/utils/lib/io'
import { attestationSecurityCode as buildSecurityCodeTypedData } from '@celo/utils/lib/typed-data-constructors'
import BigNumber from 'bignumber.js'
import fetch from 'cross-fetch'
import { CeloContract } from '../base'
import { Attestations } from '../generated/Attestations'
import { ClaimTypes, IdentityMetadataWrapper } from '../identity'
import {
  BaseWrapper,
  blocksToDurationString,
  proxyCall,
  proxySend,
  valueToBigNumber,
  valueToInt,
} from './BaseWrapper'
import { Validator } from './Validators'

function hashAddressToSingleDigit(address: Address): number {
  return new BigNumber(address.toLowerCase()).modulo(10).toNumber()
}

export function getSecurityCodePrefix(issuerAddress: Address) {
  return `${hashAddressToSingleDigit(issuerAddress)}`
}

export interface AttestationStat {
  completed: number
  total: number
}

export interface AttestationStateForIssuer {
  attestationState: AttestationState
}

export interface AttestationsToken {
  address: Address
  fee: BigNumber
}

export interface AttestationsConfig {
  attestationExpiryBlocks: number
  attestationRequestFees: AttestationsToken[]
}

/**
 * Contract for managing identities
 */
export enum AttestationState {
  None,
  Incomplete,
  Complete,
}

export interface ActionableAttestation {
  issuer: Address
  blockNumber: number
  attestationServiceURL: string
  name: string | undefined
  version: string
}

type AttestationServiceRunningCheckResult =
  | { isValid: true; result: ActionableAttestation }
  | { isValid: false; issuer: Address }

export interface UnselectedRequest {
  blockNumber: number
  attestationsRequested: number
  attestationRequestFeeToken: string
}

// Map of identifier -> (Map of address -> AttestationStat)
export type IdentifierLookupResult = Record<
  string,
  Record<Address, AttestationStat | undefined> | undefined
>

interface GetCompletableAttestationsResponse {
  0: string[]
  1: string[]
  2: string[]
  3: string
}
function parseGetCompletableAttestations(response: GetCompletableAttestationsResponse) {
  const metadataURLs = parseSolidityStringArray(
    response[2].map(valueToInt),
    (response[3] as unknown) as string
  )

  return zip3(
    response[0].map(valueToInt),
    response[1],
    metadataURLs
  ).map(([blockNumber, issuer, metadataURL]) => ({ blockNumber, issuer, metadataURL }))
}

export class AttestationsWrapper extends BaseWrapper<Attestations> {
  /**
   *  Returns the time an attestation can be completable before it is considered expired
   */
  attestationExpiryBlocks = proxyCall(
    this.contract.methods.attestationExpiryBlocks,
    undefined,
    valueToInt
  )

  /**
   * Returns the attestation request fee in a given currency.
   * @param address Token address.
   * @returns The fee as big number.
   */
  attestationRequestFees = proxyCall(
    this.contract.methods.attestationRequestFees,
    undefined,
    valueToBigNumber
  )

  selectIssuersWaitBlocks = proxyCall(
    this.contract.methods.selectIssuersWaitBlocks,
    undefined,
    valueToInt
  )

  /**
   * @notice Returns the unselected attestation request for an identifier/account pair, if any.
   * @param identifier Attestation identifier (e.g. phone hash)
   * @param account Address of the account
   */
  getUnselectedRequest = proxyCall(
    this.contract.methods.getUnselectedRequest,
    undefined,
    (res) => ({
      blockNumber: valueToInt(res[0]),
      attestationsRequested: valueToInt(res[1]),
      attestationRequestFeeToken: res[2],
    })
  )

  /**
   * @notice Checks if attestation request is expired.
   * @param attestationRequestBlockNumber Attestation Request Block Number to be checked
   */
  isAttestationExpired = async (attestationRequestBlockNumber: number) => {
    // We duplicate the implementation here, until Attestation.sol->isAttestationExpired is not external
    const attestationExpiryBlocks = await this.attestationExpiryBlocks()
    const blockNumber = await this.kit.connection.getBlockNumber()
    return blockNumber >= attestationRequestBlockNumber + attestationExpiryBlocks
  }

  /**
   * @notice Waits for appropriate block numbers for before issuer can be selected
   * @param identifier Attestation identifier (e.g. phone hash)
   * @param account Address of the account
   */
  waitForSelectingIssuers = async (
    identifier: string,
    account: Address,
    timeoutSeconds = 120,
    pollDurationSeconds = 1
  ) => {
    const startTime = Date.now()
    const unselectedRequest = await this.getUnselectedRequest(identifier, account)
    const waitBlocks = await this.selectIssuersWaitBlocks()

    if (unselectedRequest.blockNumber === 0) {
      throw new Error('No unselectedRequest to wait for')
    }
    // Technically should use subscriptions here but not all providers support it.
    // TODO: Use subscription if provider supports
    while (Date.now() - startTime < timeoutSeconds * 1000) {
      const blockNumber = await this.kit.connection.getBlockNumber()
      if (blockNumber >= unselectedRequest.blockNumber + waitBlocks) {
        return
      }
      await sleep(pollDurationSeconds * 1000)
    }
    throw new Error('Timeout while waiting for selecting issuers')
  }

  /**
   * Returns the issuers of attestations for a phoneNumber/account combo
   * @param identifier Attestation identifier (e.g. phone hash)
   * @param account Address of the account
   */
  getAttestationIssuers = proxyCall(this.contract.methods.getAttestationIssuers)

  /**
   * Returns the attestation state of a phone number/account/issuer tuple
   * @param identifier Attestation identifier (e.g. phone hash)
   * @param account Address of the account
   */
  getAttestationState: (
    identifier: string,
    account: Address,
    issuer: Address
  ) => Promise<AttestationStateForIssuer> = proxyCall(
    this.contract.methods.getAttestationState,
    undefined,
    (state) => ({ attestationState: valueToInt(state[0]) })
  )

  /**
   * Returns the attestation stats of a identifer/account pair
   * @param identifier Attestation identifier (e.g. phone hash)
   * @param account Address of the account
   */
  getAttestationStat: (
    identifier: string,
    account: Address
  ) => Promise<AttestationStat> = proxyCall(
    this.contract.methods.getAttestationStats,
    undefined,
    (stat) => ({ completed: valueToInt(stat[0]), total: valueToInt(stat[1]) })
  )

  /**
   * Returns the verified status of an identifier/account pair indicating whether the attestation
   * stats for a given pair are completed beyond a certain threshold of confidence (aka "verified")
   * @param identifier Attestation identifier (e.g. phone hash)
   * @param account Address of the account
   * @param numAttestationsRequired Optional number of attestations required.  Will default to
   *  hardcoded value if absent.
   * @param attestationThreshold Optional threshold for fraction attestations completed. Will
   *  default to hardcoded value if absent.
   */
  async getVerifiedStatus(
    identifier: string,
    account: Address,
    numAttestationsRequired?: number,
    attestationThreshold?: number
  ) {
    const attestationStats = await this.getAttestationStat(identifier, account)
    return AttestationUtils.isAccountConsideredVerified(
      attestationStats,
      numAttestationsRequired,
      attestationThreshold
    )
  }

  /**
   * Calculates the amount of StableToken required to request Attestations
   * @param attestationsRequested  The number of attestations to request
   */
  async getAttestationFeeRequired(attestationsRequested: number) {
    const tokenAddress = await this.kit.registry.addressFor(CeloContract.StableToken)
    const attestationFee = await this.contract.methods.getAttestationRequestFee(tokenAddress).call()
    return new BigNumber(attestationFee).times(attestationsRequested)
  }

  /**
   * Approves the necessary amount of StableToken to request Attestations
   * @param attestationsRequested The number of attestations to request
   */
  async approveAttestationFee(attestationsRequested: number) {
    const tokenContract = await this.kit.contracts.getContract(CeloContract.StableToken)
    const fee = await this.getAttestationFeeRequired(attestationsRequested)
    return tokenContract.approve(this.address, fee.toFixed())
  }

  /**
   * Returns an array of attestations that can be completed, along with the issuers' attestation
   * service urls
   * @param identifier Attestation identifier (e.g. phone hash)
   * @param account Address of the account
   */
  async getActionableAttestations(
    identifier: string,
    account: Address,
    tries = 3
  ): Promise<ActionableAttestation[]> {
    const result = await this.contract.methods
      .getCompletableAttestations(identifier, account)
      .call()

    const results = await concurrentMap(
      5,
      parseGetCompletableAttestations(result),
      this.makeIsIssuerRunningAttestationService(tries)
    )

    return results.map((_) => (_.isValid ? _.result : null)).filter(notEmpty)
  }

  /**
   * Returns an array of issuer addresses that were found to not run the attestation service
   * @param identifier Attestation identifier (e.g. phone hash)
   * @param account Address of the account
   */
  async getNonCompliantIssuers(
    identifier: string,
    account: Address,
    tries = 3
  ): Promise<Address[]> {
    const result = await this.contract.methods
      .getCompletableAttestations(identifier, account)
      .call()

    const withAttestationServiceURLs = await concurrentMap(
      5,
      parseGetCompletableAttestations(result),
      this.makeIsIssuerRunningAttestationService(tries)
    )

    return withAttestationServiceURLs.map((_) => (_.isValid ? null : _.issuer)).filter(notEmpty)
  }

  private makeIsIssuerRunningAttestationService = (tries = 3) => {
    return async (arg: {
      blockNumber: number
      issuer: string
      metadataURL: string
    }): Promise<AttestationServiceRunningCheckResult> => {
      try {
        const metadata = await IdentityMetadataWrapper.fetchFromURL(
          this.kit,
          arg.metadataURL,
          tries
        )
        const attestationServiceURLClaim = metadata.findClaim(ClaimTypes.ATTESTATION_SERVICE_URL)

        if (attestationServiceURLClaim === undefined) {
          throw new Error(`No attestation service URL registered for ${arg.issuer}`)
        }

        const nameClaim = metadata.findClaim(ClaimTypes.NAME)

        const resp = await fetch(
          `${attestationServiceURLClaim.url}${
            attestationServiceURLClaim.url.substr(-1) === '/' ? '' : '/'
          }status`
        )
        if (!resp.ok) {
          throw new Error(`Request failed with status ${resp.status}`)
        }
        const { status, version } = await resp.json()

        if (status !== 'ok') {
          return { isValid: false, issuer: arg.issuer }
        }

        return {
          isValid: true,
          result: {
            blockNumber: arg.blockNumber,
            issuer: arg.issuer,
            attestationServiceURL: attestationServiceURLClaim.url,
            name: nameClaim ? nameClaim.name : undefined,
            version,
          },
        }
      } catch (error) {
        return { isValid: false, issuer: arg.issuer }
      }
    }
  }

  /**
   * Completes an attestation with the corresponding code
   * @param identifier Attestation identifier (e.g. phone hash)
   * @param account Address of the account
   * @param issuer The issuer of the attestation
   * @param code The code received by the validator
   */
  async complete(identifier: string, account: Address, issuer: Address, code: string) {
    const accounts = await this.kit.contracts.getAccounts()
    const attestationSigner = await accounts.getAttestationSigner(issuer)
    const expectedSourceMessage = AttestationUtils.getAttestationMessageToSignFromIdentifier(
      identifier,
      account
    )
    const { r, s, v } = SignatureUtils.parseSignature(
      expectedSourceMessage,
      code,
      attestationSigner
    )
    return toTransactionObject(
      this.kit.connection,
      this.contract.methods.complete(identifier, v, r, s)
    )
  }

  /**
   * Returns the attestation signer for the specified account.
   * @param account The address of token rewards are accumulated in.
   * @param account The address of the account.
   * @return The reward amount.
   */
  getPendingWithdrawals: (token: string, account: string) => Promise<BigNumber> = proxyCall(
    this.contract.methods.pendingWithdrawals,
    undefined,
    valueToBigNumber
  )

  /**
   * Allows issuers to withdraw accumulated attestation rewards
   * @param address The address of the token that will be withdrawn
   */
  withdraw = proxySend(this.kit, this.contract.methods.withdraw)

  /**
   * Given a list of issuers, finds the matching issuer for a given code
   * @param identifier Attestation identifier (e.g. phone hash)
   * @param account Address of the account
   * @param code The code received by the validator
   * @param issuers The list of potential issuers
   */
  async findMatchingIssuer(
    identifier: string,
    account: Address,
    code: string,
    issuers: string[]
  ): Promise<string | null> {
    const accounts = await this.kit.contracts.getAccounts()
    const expectedSourceMessage = AttestationUtils.getAttestationMessageToSignFromIdentifier(
      identifier,
      account
    )
    for (const issuer of issuers) {
      const attestationSigner = await accounts.getAttestationSigner(issuer)

      try {
        SignatureUtils.parseSignature(expectedSourceMessage, code, attestationSigner)
        return issuer
      } catch (error) {
        continue
      }
    }
    return null
  }

  /**
   * Returns the current configuration parameters for the contract.
   * @param tokens List of tokens used for attestation fees.
   * @return AttestationsConfig object
   */
  async getConfig(tokens: string[]): Promise<AttestationsConfig> {
    const fees = await Promise.all(
      tokens.map(async (token) => {
        const fee = await this.attestationRequestFees(token)
        return { fee, address: token }
      })
    )
    return {
      attestationExpiryBlocks: await this.attestationExpiryBlocks(),
      attestationRequestFees: fees,
    }
  }

  /**
   * @dev Returns human readable configuration of the attestations contract
   * @return AttestationsConfig object
   */
  async getHumanReadableConfig(tokens: string[]) {
    const config = await this.getConfig(tokens)
    return {
      attestationRequestFees: config.attestationRequestFees,
      attestationExpiry: blocksToDurationString(config.attestationExpiryBlocks),
    }
  }

  /**
   * Returns the list of accounts associated with an identifier.
   * @param identifier Attestation identifier (e.g. phone hash)
   */
  lookupAccountsForIdentifier = proxyCall(this.contract.methods.lookupAccountsForIdentifier)

  /**
   * Lookup mapped wallet addresses for a given list of identifiers
   * @param identifiers Attestation identifiers (e.g. phone hashes)
   */
  async lookupIdentifiers(identifiers: string[]): Promise<IdentifierLookupResult> {
    // Unfortunately can't be destructured
    const stats = await this.contract.methods.batchGetAttestationStats(identifiers).call()

    const matches = stats[0].map(valueToInt)
    const addresses = stats[1]
    const completed = stats[2].map(valueToInt)
    const total = stats[3].map(valueToInt)
    // Map of identifier -> (Map of address -> AttestationStat)
    const result: IdentifierLookupResult = {}

    let rIndex = 0

    for (let pIndex = 0; pIndex < identifiers.length; pIndex++) {
      const pHash = identifiers[pIndex]
      const numberOfMatches = matches[pIndex]
      if (numberOfMatches === 0) {
        continue
      }

      const matchingAddresses: Record<string, AttestationStat> = {}
      for (let mIndex = 0; mIndex < numberOfMatches; mIndex++) {
        const matchingAddress = addresses[rIndex]
        matchingAddresses[matchingAddress] = {
          completed: completed[rIndex],
          total: total[rIndex],
        }
        rIndex++
      }

      result[pHash] = matchingAddresses
    }

    return result
  }

  /**
   * Requests a new attestation
   * @param identifier Attestation identifier (e.g. phone hash)
   * @param attestationsRequested The number of attestations to request
   */
  async request(identifier: string, attestationsRequested: number) {
    const tokenAddress = await this.kit.registry.addressFor(CeloContract.StableToken)
    return toTransactionObject(
      this.kit.connection,
      this.contract.methods.request(identifier, attestationsRequested, tokenAddress)
    )
  }

  /**
   * Updates sender's approval status on whether to allow an attestation identifier
   * mapping to be transfered from one address to another.
   * @param identifier The identifier for this attestation.
   * @param index The index of the account in the accounts array.
   * @param from The current attestation address to which the identifier is mapped.
   * @param to The new address to map to identifier.
   * @param status The approval status
   */
  approveTransfer = proxySend(this.kit, this.contract.methods.approveTransfer)

  /**
   * Selects the issuers for previously requested attestations for a phone number
   * @param identifier Attestation identifier (e.g. phone hash)
   */
  selectIssuers(identifier: string) {
    return toTransactionObject(this.kit.connection, this.contract.methods.selectIssuers(identifier))
  }

  /**
   * Waits appropriate number of blocks, then selects issuers for previously requested phone number attestations
   * @param identifier Attestation identifier (e.g. phone hash)
   * @param account Address of the account
   */
  async selectIssuersAfterWait(
    identifier: string,
    account: string,
    timeoutSeconds?: number,
    pollDurationSeconds?: number
  ) {
    await this.waitForSelectingIssuers(identifier, account, timeoutSeconds, pollDurationSeconds)
    return this.selectIssuers(identifier)
  }

  /**
   * Reveal phone number to issuer
   * @param serviceURL: validator's attestation service URL
   * @param body
   */
  revealPhoneNumberToIssuer(serviceURL: string, requestBody: AttestationRequest) {
    return fetch(appendPath(serviceURL, 'attestations'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
  }

  /**
   * Returns reveal status from validator's attestation service
   * @param phoneNumber: attestation's phone number
   * @param account: attestation's account
   * @param issuer: validator's address
   * @param serviceURL: validator's attestation service URL
   * @param pepper: phone number privacy pepper
   */
  getRevealStatus(
    phoneNumber: string,
    account: Address,
    issuer: Address,
    serviceURL: string,
    pepper?: string
  ) {
    const urlParams = new URLSearchParams({
      phoneNumber,
      salt: pepper ?? '',
      issuer,
      account,
    })
    return fetch(appendPath(serviceURL, 'get_attestations') + '?' + urlParams, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * Returns attestation code for provided security code from validator's attestation service
   * @param serviceURL: validator's attestation service URL
   * @param body
   */
  async getAttestationForSecurityCode(
    serviceURL: string,
    requestBody: GetAttestationRequest,
    signer: Address
  ): Promise<string> {
    const urlParams = new URLSearchParams({
      phoneNumber: requestBody.phoneNumber,
      account: requestBody.account,
      issuer: requestBody.issuer,
    })

    let additionalHeaders = {}
    if (requestBody.salt) {
      urlParams.set('salt', requestBody.salt)
    }
    if (requestBody.securityCode) {
      urlParams.set('securityCode', requestBody.securityCode)
      const signature = await this.kit.signTypedData(
        signer,
        buildSecurityCodeTypedData(requestBody.securityCode)
      )
      additionalHeaders = {
        Authentication: SignatureUtils.serializeSignature(signature),
      }
    }

    const response = await fetch(appendPath(serviceURL, 'get_attestations') + '?' + urlParams, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...additionalHeaders },
    })

    const { ok, status } = response
    if (ok) {
      const body = await response.json()
      if (body.attestationCode) {
        return body.attestationCode
      }
    }
    throw new Error(
      `Error getting security code for ${requestBody.issuer}. ${status}: ${await response.text()}`
    )
  }

  /**
   * Validates a given code by the issuer on-chain
   * @param identifier Attestation identifier (e.g. phone hash)
   * @param account The address of the account which requested attestation
   * @param issuer The address of the issuer of the attestation
   * @param code The code send by the issuer
   */
  async validateAttestationCode(
    identifier: string,
    account: Address,
    issuer: Address,
    code: string
  ) {
    const accounts = await this.kit.contracts.getAccounts()
    const attestationSigner = await accounts.getAttestationSigner(issuer)
    const expectedSourceMessage = AttestationUtils.getAttestationMessageToSignFromIdentifier(
      identifier,
      account
    )
    const { r, s, v } = SignatureUtils.parseSignature(
      expectedSourceMessage,
      code,
      attestationSigner
    )
    const result = await this.contract.methods
      .validateAttestationCode(identifier, account, v, r, s)
      .call()
    return result.toLowerCase() !== NULL_ADDRESS
  }

  /**
   * Gets the relevant attestation service status for a validator
   * @param validator Validator to get the attestation service status for
   */
  async getAttestationServiceStatus(
    validator: Validator
  ): Promise<AttestationServiceStatusResponse> {
    const accounts = await this.kit.contracts.getAccounts()
    const hasAttestationSigner = await accounts.hasAuthorizedAttestationSigner(validator.address)
    const attestationSigner = await accounts.getAttestationSigner(validator.address)

    let attestationServiceURL: string

    const ret: AttestationServiceStatusResponse = {
      ...validator,
      hasAttestationSigner,
      attestationSigner,
      attestationServiceURL: null,
      okStatus: false,
      error: null,
      smsProviders: [],
      blacklistedRegionCodes: [],
      rightAccount: false,
      metadataURL: null,
      state: AttestationServiceStatusState.NoAttestationSigner,
      version: null,
      ageOfLatestBlock: null,
      smsProvidersRandomized: null,
      maxDeliveryAttempts: null,
      maxRerequestMins: null,
      twilioVerifySidProvided: null,
    }

    if (!hasAttestationSigner) {
      return ret
    }

    const metadataURL = await accounts.getMetadataURL(validator.address)
    ret.metadataURL = metadataURL

    if (!metadataURL) {
      ret.state = AttestationServiceStatusState.NoMetadataURL
      return ret
    }

    if (metadataURL.startsWith('http://')) {
      ret.state = AttestationServiceStatusState.InvalidAttestationServiceURL
      return ret
    }

    try {
      const metadata = await IdentityMetadataWrapper.fetchFromURL(this.kit, metadataURL)
      const attestationServiceURLClaim = metadata.findClaim(ClaimTypes.ATTESTATION_SERVICE_URL)

      if (!attestationServiceURLClaim) {
        ret.state = AttestationServiceStatusState.NoAttestationServiceURL
        return ret
      }

      attestationServiceURL = attestationServiceURLClaim.url
    } catch (error) {
      ret.state =
        error.type === 'system'
          ? AttestationServiceStatusState.MetadataTimeout
          : AttestationServiceStatusState.InvalidMetadata
      ret.error = error
      return ret
    }

    ret.attestationServiceURL = attestationServiceURL

    try {
      const statusResponse = await fetch(appendPath(attestationServiceURL, 'status'))

      if (!statusResponse.ok) {
        ret.state = AttestationServiceStatusState.UnreachableAttestationService
        return ret
      }

      ret.okStatus = true
      const statusResponseBody = await statusResponse.json()
      ret.smsProviders = statusResponseBody.smsProviders
      ret.rightAccount = eqAddress(validator.address, statusResponseBody.accountAddress)
      ret.state = ret.rightAccount
        ? AttestationServiceStatusState.Valid
        : AttestationServiceStatusState.WrongAccount
      ret.ageOfLatestBlock = statusResponseBody.ageOfLatestBlock
      ret.smsProvidersRandomized = statusResponseBody.smsProvidersRandomized
      ret.maxDeliveryAttempts = statusResponseBody.maxDeliveryAttempts
      ret.maxRerequestMins = statusResponseBody.maxRerequestMins
      ret.twilioVerifySidProvided = statusResponseBody.twilioVerifySidProvided

      // Healthcheck was added in 1.0.1, same time version started being reported.
      if (statusResponseBody.version) {
        ret.version = statusResponseBody.version

        // Try healthcheck
        try {
          const healthzResponse = await fetch(appendPath(attestationServiceURL, 'healthz'))
          const healthzResponseBody = await healthzResponse.json()
          if (!healthzResponse.ok) {
            ret.state = AttestationServiceStatusState.Unhealthy
            if (healthzResponseBody.error) {
              ret.error = healthzResponseBody.error
            }
          }
        } catch (error) {
          ret.state = AttestationServiceStatusState.UnreachableHealthz
        }

        // Whether or not health check is reachable, also check full node status
        // (overrides UnreachableHealthz status)
        if (
          (statusResponseBody.ageOfLatestBlock !== null &&
            statusResponseBody.ageOfLatestBlock > 10) ||
          statusResponseBody.isNodeSyncing === true
        ) {
          ret.state = AttestationServiceStatusState.Unhealthy
        }
      } else {
        // No version implies 1.0.0
        ret.version = '1.0.0'
      }
    } catch (error) {
      ret.state = AttestationServiceStatusState.UnreachableAttestationService
      ret.error = error
    }

    return ret
  }

  async revoke(identifer: string, account: Address) {
    const accounts = await this.lookupAccountsForIdentifier(identifer)
    const idx = accounts.findIndex((acc) => eqAddress(acc, account))
    if (idx < 0) {
      throw new Error("Account not found in identifier's accounts")
    }
    return toTransactionObject(this.kit.connection, this.contract.methods.revoke(identifer, idx))
  }
}

export enum AttestationServiceStatusState {
  NoAttestationSigner = 'NoAttestationSigner',
  NoMetadataURL = 'NoMetadataURL',
  InvalidMetadata = 'InvalidMetadata',
  NoAttestationServiceURL = 'NoAttestationServiceURL',
  InvalidAttestationServiceURL = 'InvalidAttestationServiceURL',
  UnreachableAttestationService = 'UnreachableAttestationService',
  Valid = 'Valid',
  UnreachableHealthz = 'UnreachableHealthz',
  Unhealthy = 'Unhealthy',
  WrongAccount = 'WrongAccount',
  MetadataTimeout = 'MetadataTimeout',
}
export interface AttestationServiceStatusResponse {
  name: string
  address: Address
  ecdsaPublicKey: string
  blsPublicKey: string
  affiliation: string | null
  score: BigNumber
  hasAttestationSigner: boolean
  attestationSigner: string
  attestationServiceURL: string | null
  metadataURL: string | null
  okStatus: boolean
  error: null | Error
  smsProviders: string[]
  blacklistedRegionCodes: string[] | null
  rightAccount: boolean
  signer: string
  state: AttestationServiceStatusState
  version: string | null
  ageOfLatestBlock: number | null
  smsProvidersRandomized: boolean | null
  maxDeliveryAttempts: number | null
  maxRerequestMins: number | null
  twilioVerifySidProvided: boolean | null
}
