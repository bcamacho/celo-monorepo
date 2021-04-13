import path from 'path'
import { exec } from 'child_process'

import { CoreContracts } from './build'

const ROOT_DIR = path.normalize(path.join(__dirname, '../'))

const UNSAFE_OPCODES = ['selfdestruct', 'delegatecall']
const IGNORE_CONTRACTS = ['ReleaseGold', 'TransferWhitelist']

const CHECK_CONTRACTS = CoreContracts.filter((c) => !IGNORE_CONTRACTS.includes(c))

exec(
  `rg --no-heading "${UNSAFE_OPCODES.join('|')}" ${ROOT_DIR}/contracts`,
  (err, rg_output, stderr) => {
    if (err || stderr) {
      throw new Error('ripgrep failed')
    }

    const opcode_lines = rg_output.toString().split('\n')

    let safe = true
    opcode_lines.forEach((line) => {
      const contract_path = line.split('.sol')[0].split('/')
      const contract_match = contract_path[contract_path.length - 1]
      if (CHECK_CONTRACTS.includes(contract_match)) {
        safe = false
        console.error(
          `Core contract ${contract_match} should not include ${UNSAFE_OPCODES} opcodes`
        )
      }
    })

    if (safe) {
      console.log(`Core contracts are safe against ${UNSAFE_OPCODES} vulnerabilities`)
    } else {
      process.exit(1)
    }
  }
)
