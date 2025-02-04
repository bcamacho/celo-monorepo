# Module: "odis/query"

## Index

### Enumerations

* [AuthenticationMethod](../enums/_odis_query_.authenticationmethod.md)
* [ErrorMessages](../enums/_odis_query_.errormessages.md)

### Interfaces

* [CustomSigner](../interfaces/_odis_query_.customsigner.md)
* [EncryptionKeySigner](../interfaces/_odis_query_.encryptionkeysigner.md)
* [MatchmakingRequest](../interfaces/_odis_query_.matchmakingrequest.md)
* [MatchmakingResponse](../interfaces/_odis_query_.matchmakingresponse.md)
* [PhoneNumberPrivacyRequest](../interfaces/_odis_query_.phonenumberprivacyrequest.md)
* [ServiceContext](../interfaces/_odis_query_.servicecontext.md)
* [SignMessageRequest](../interfaces/_odis_query_.signmessagerequest.md)
* [SignMessageResponse](../interfaces/_odis_query_.signmessageresponse.md)
* [WalletKeySigner](../interfaces/_odis_query_.walletkeysigner.md)

### Type aliases

* [AuthSigner](_odis_query_.md#authsigner)

### Functions

* [getServiceContext](_odis_query_.md#getservicecontext)
* [queryOdis](_odis_query_.md#queryodis)
* [signWithDEK](_odis_query_.md#signwithdek)

### Object literals

* [ODIS_ALFAJORESSTAGING_CONTEXT](_odis_query_.md#const-odis_alfajoresstaging_context)
* [ODIS_ALFAJORES_CONTEXT](_odis_query_.md#const-odis_alfajores_context)
* [ODIS_MAINNET_CONTEXT](_odis_query_.md#const-odis_mainnet_context)

## Type aliases

###  AuthSigner

Ƭ **AuthSigner**: *[WalletKeySigner](../interfaces/_odis_query_.walletkeysigner.md) | [EncryptionKeySigner](../interfaces/_odis_query_.encryptionkeysigner.md) | [CustomSigner](../interfaces/_odis_query_.customsigner.md)*

*Defined in [packages/sdk/identity/src/odis/query.ts:29](https://github.com/celo-org/celo-monorepo/blob/master/packages/sdk/identity/src/odis/query.ts#L29)*

## Functions

###  getServiceContext

▸ **getServiceContext**(`contextName`: string): *[ServiceContext](../interfaces/_odis_query_.servicecontext.md)*

*Defined in [packages/sdk/identity/src/odis/query.ts:98](https://github.com/celo-org/celo-monorepo/blob/master/packages/sdk/identity/src/odis/query.ts#L98)*

**Parameters:**

Name | Type | Default |
------ | ------ | ------ |
`contextName` | string | "mainnet" |

**Returns:** *[ServiceContext](../interfaces/_odis_query_.servicecontext.md)*

___

###  queryOdis

▸ **queryOdis**<**ResponseType**>(`signer`: [AuthSigner](_odis_query_.md#authsigner), `body`: [PhoneNumberPrivacyRequest](../interfaces/_odis_query_.phonenumberprivacyrequest.md), `context`: [ServiceContext](../interfaces/_odis_query_.servicecontext.md), `endpoint`: string): *Promise‹ResponseType›*

*Defined in [packages/sdk/identity/src/odis/query.ts:128](https://github.com/celo-org/celo-monorepo/blob/master/packages/sdk/identity/src/odis/query.ts#L128)*

Make a request to lookup the phone number identifier or perform matchmaking

**Type parameters:**

▪ **ResponseType**

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`signer` | [AuthSigner](_odis_query_.md#authsigner) | type of key to sign with |
`body` | [PhoneNumberPrivacyRequest](../interfaces/_odis_query_.phonenumberprivacyrequest.md) | request body |
`context` | [ServiceContext](../interfaces/_odis_query_.servicecontext.md) | contains service URL |
`endpoint` | string | endpoint to hit  |

**Returns:** *Promise‹ResponseType›*

___

###  signWithDEK

▸ **signWithDEK**(`message`: string, `signer`: [EncryptionKeySigner](../interfaces/_odis_query_.encryptionkeysigner.md)): *string*

*Defined in [packages/sdk/identity/src/odis/query.ts:109](https://github.com/celo-org/celo-monorepo/blob/master/packages/sdk/identity/src/odis/query.ts#L109)*

**Parameters:**

Name | Type |
------ | ------ |
`message` | string |
`signer` | [EncryptionKeySigner](../interfaces/_odis_query_.encryptionkeysigner.md) |

**Returns:** *string*

## Object literals

### `Const` ODIS_ALFAJORESSTAGING_CONTEXT

### ▪ **ODIS_ALFAJORESSTAGING_CONTEXT**: *object*

*Defined in [packages/sdk/identity/src/odis/query.ts:86](https://github.com/celo-org/celo-monorepo/blob/master/packages/sdk/identity/src/odis/query.ts#L86)*

###  odisPubKey

• **odisPubKey**: *string* = "7FsWGsFnmVvRfMDpzz95Np76wf/1sPaK0Og9yiB+P8QbjiC8FV67NBans9hzZEkBaQMhiapzgMR6CkZIZPvgwQboAxl65JWRZecGe5V3XO4sdKeNemdAZ2TzQuWkuZoA"

*Defined in [packages/sdk/identity/src/odis/query.ts:88](https://github.com/celo-org/celo-monorepo/blob/master/packages/sdk/identity/src/odis/query.ts#L88)*

###  odisUrl

• **odisUrl**: *string* = "https://us-central1-celo-phone-number-privacy-stg.cloudfunctions.net"

*Defined in [packages/sdk/identity/src/odis/query.ts:87](https://github.com/celo-org/celo-monorepo/blob/master/packages/sdk/identity/src/odis/query.ts#L87)*

___

### `Const` ODIS_ALFAJORES_CONTEXT

### ▪ **ODIS_ALFAJORES_CONTEXT**: *object*

*Defined in [packages/sdk/identity/src/odis/query.ts:80](https://github.com/celo-org/celo-monorepo/blob/master/packages/sdk/identity/src/odis/query.ts#L80)*

###  odisPubKey

• **odisPubKey**: *string* = "kPoRxWdEdZ/Nd3uQnp3FJFs54zuiS+ksqvOm9x8vY6KHPG8jrfqysvIRU0wtqYsBKA7SoAsICMBv8C/Fb2ZpDOqhSqvr/sZbZoHmQfvbqrzbtDIPvUIrHgRS0ydJCMsA"

*Defined in [packages/sdk/identity/src/odis/query.ts:82](https://github.com/celo-org/celo-monorepo/blob/master/packages/sdk/identity/src/odis/query.ts#L82)*

###  odisUrl

• **odisUrl**: *string* = "https://us-central1-celo-phone-number-privacy.cloudfunctions.net"

*Defined in [packages/sdk/identity/src/odis/query.ts:81](https://github.com/celo-org/celo-monorepo/blob/master/packages/sdk/identity/src/odis/query.ts#L81)*

___

### `Const` ODIS_MAINNET_CONTEXT

### ▪ **ODIS_MAINNET_CONTEXT**: *object*

*Defined in [packages/sdk/identity/src/odis/query.ts:92](https://github.com/celo-org/celo-monorepo/blob/master/packages/sdk/identity/src/odis/query.ts#L92)*

###  odisPubKey

• **odisPubKey**: *string* = "FvreHfLmhBjwxHxsxeyrcOLtSonC9j7K3WrS4QapYsQH6LdaDTaNGmnlQMfFY04Bp/K4wAvqQwO9/bqPVCKf8Ze8OZo8Frmog4JY4xAiwrsqOXxug11+htjEe1pj4uMA"

*Defined in [packages/sdk/identity/src/odis/query.ts:94](https://github.com/celo-org/celo-monorepo/blob/master/packages/sdk/identity/src/odis/query.ts#L94)*

###  odisUrl

• **odisUrl**: *string* = "https://us-central1-celo-pgpnp-mainnet.cloudfunctions.net"

*Defined in [packages/sdk/identity/src/odis/query.ts:93](https://github.com/celo-org/celo-monorepo/blob/master/packages/sdk/identity/src/odis/query.ts#L93)*
