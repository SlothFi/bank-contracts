import chai, { expect } from 'chai'
import { Contract, ContractFactory, utils } from 'ethers'
import { BigNumber } from 'ethers/utils'
import { solidity, MockProvider, deployContract } from 'ethereum-waffle'

import { expandTo18Decimals, humanBalance } from './shared/utilities'
import { advanceBlockWith } from './shared/time'

import { deployGovernanceToken, deployMasterBanker } from './shared/deploy'

import { createLpToken } from './shared/lp'

import Bank from '../build/Bank.json'
import ERC20Mock from '../build/ERC20Mock.json'
import UniswapV2Factory from '@slothfi/bank-core/build/UniswapV2Factory.json'
import UniswapV2Pair from '@slothfi/bank-core/build/UniswapV2Pair.json'
import GovernanceVote from '../build/GovernanceVote.json'

chai.use(solidity)

const STARTING_BALANCE = expandTo18Decimals(10000)
const BANK_BALANCE = expandTo18Decimals(100)
const REWARDS_START_BLOCK = 0
const HALVING_AFTER_BLOCK_COUNT = 45360 // Ethereum blocks per week, based on ~13s block time
const REWARDS_PER_BLOCK = 1
const POOL_ID = 0
const MULTIPLIERS = {
  lpStaking: 4,
  singleStaking: 2
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

const debugMessages = false

describe('GovernanceVote', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const wallets = provider.getWallets()
  const [alice, bob, carol, minter, dev, liquidityFund, communityFund, founderFund] = wallets

  let banker: Contract
  let bank: Contract
  let govVote: Contract
  let factory: Contract
  let pairFactory: ContractFactory
  let govToken: Contract
  let govTokenBalance: BigNumber
  let weth: Contract
  let wethTokenBalance: BigNumber
  let lpPair: Contract
  let govTokenReservePosition: number

  beforeEach(async () => {
    govToken = await deployGovernanceToken(alice)
    await govToken.mint(alice.address, STARTING_BALANCE)
    govTokenBalance = expandTo18Decimals(1000)

    weth = await deployContract(alice, ERC20Mock, ["WETH", "ETH", expandTo18Decimals(10000000)])
    await weth.transfer(alice.address, STARTING_BALANCE)
    wethTokenBalance = expandTo18Decimals(500)

    bank = await deployContract(alice, Bank, ["MonBank", "xMON", govToken.address])

    banker = await deployMasterBanker(wallets, govToken, expandTo18Decimals(1000), REWARDS_START_BLOCK, HALVING_AFTER_BLOCK_COUNT)

    factory = await deployContract(alice, UniswapV2Factory, [alice.address])
    pairFactory = new ContractFactory(UniswapV2Pair.abi, UniswapV2Pair.bytecode, alice)

    lpPair = await createLpToken(alice, factory, pairFactory, govToken, weth, govTokenBalance, wethTokenBalance)

    const token0 = await lpPair.token0()
    govTokenReservePosition = (token0 === govToken.address) ? 0 : 1

    govVote = await deployContract(
      alice,
      GovernanceVote,
      [
        "MonVote",
        "MonVote",
        govToken.address,
        bank.address,
        banker.address,
        POOL_ID,
        lpPair.address,
        govTokenReservePosition,
        MULTIPLIERS.lpStaking,
        MULTIPLIERS.singleStaking
      ]
    )
  })

  it('should have correct values for: name, symbol, decimals, govToken, masterBanker, lpPair, bank', async () => {
    expect(await govVote.name()).to.eq('MonVote')
    expect(await govVote.symbol()).to.eq('MonVote')
    expect(await govVote.decimals()).to.eq(18)
    expect(await govVote.govToken()).to.eq(govToken.address)
    expect(await govVote.masterBanker()).to.eq(banker.address)
    expect(await govVote.lpPair()).to.eq(lpPair.address)
    expect(await govVote.bank()).to.eq(bank.address)
  })

  it('should correctly calculate totalSupply', async () => {
    if (debugMessages) console.log(`govToken -> address: ${govToken.address}`)
    if (debugMessages) console.log(`govTokenReservePosition: ${govTokenReservePosition}`)

    const token0 = await lpPair.token0()
    const token1 = await lpPair.token1()
    const [ reserve0, reserve1 ] = await lpPair.getReserves()
    
    if (debugMessages) {
      console.log(`lpPair -> token0: ${token0} - reserve0: ${utils.formatEther(reserve0.toString())}`)
      console.log(`lpPair -> token1: ${token1} - reserve1: ${utils.formatEther(reserve1.toString())}`)
    }

    const lpGovTokenReserve = govTokenReservePosition === 0 ? reserve0 : reserve1

    const govTokenReserve = await govVote.govTokenReserve()
    if (debugMessages) console.log(`govVote -> govTokenReserve: ${utils.formatEther(govTokenReserve.toString())}`)

    expect(govTokenBalance).to.eq(lpGovTokenReserve)
    expect(lpGovTokenReserve).to.eq(govTokenReserve)
    expect(govTokenBalance).to.eq(govTokenReserve)

    // Enter the bank
    await govToken.approve(bank.address, BANK_BALANCE)
    await bank.enter(BANK_BALANCE)

    // Lock 1,0000 tokens - 95% locked, 5% unlocked
    const lockAmount = govTokenBalance.mul(95).div(100)
    if (debugMessages) console.log(`Locking token balances - amount: ${utils.formatEther(lockAmount.toString())}`)
    await govToken.lock(alice.address, lockAmount)

    const bankTotalSupply = await bank.totalSupply()
    const bankRatio = await govVote.bankRatio()
    const adjustedBankTotalSupply = await govVote.adjustedBankValue(bankTotalSupply)
    if (debugMessages) console.log(`bank -> bankRatio: ${utils.formatEther(bankRatio.toString())}`)
    if (debugMessages) console.log(`bank -> totalSupply: ${utils.formatEther(adjustedBankTotalSupply.toString())}`)
    expect(adjustedBankTotalSupply).to.eq(BANK_BALANCE)

    const govTokenUnlockedTotal = await govToken.unlockedSupply()
    if (debugMessages) console.log(`govToken -> unlockedSupply: ${utils.formatEther(govTokenUnlockedTotal.toString())}`)
    expect(govTokenUnlockedTotal).to.eq(STARTING_BALANCE.sub(lockAmount))

    const govTokenLockedTotal = await govToken.totalLock()
    if (debugMessages) console.log(`govToken -> totalLock: ${utils.formatEther(govTokenLockedTotal.toString())}`)
    expect(govTokenLockedTotal).to.eq(lockAmount)

    const expectedCalculatedGovTokenReserve = govTokenReserve.gt(0) ? govTokenReserve.mul(4) : govTokenReserve
    const expectedBankTotalSupply = bankTotalSupply.gt(0) ? bankTotalSupply.mul(2) : bankTotalSupply
    const expectedCalculatedGovTokenLockedTotal = govTokenLockedTotal.gt(0) ? govTokenLockedTotal.mul(33).div(100) : govTokenLockedTotal
    const expectedCalculatedUnlockedTotal = govTokenUnlockedTotal.gt(0) ? govTokenUnlockedTotal.mul(25).div(100) : govTokenUnlockedTotal

    const expectedCalculatedGovVoteTotalSupply = expectedCalculatedGovTokenReserve
      .add(expectedBankTotalSupply)
      .add(expectedCalculatedGovTokenLockedTotal)
      .add(expectedCalculatedUnlockedTotal)

    const govVoteTotalSupply = await govVote.totalSupply()
    if (debugMessages) console.log(`govVote -> totalSupply: ${utils.formatEther(govVoteTotalSupply.toString())}`)
    expect(govVoteTotalSupply).to.eq(expectedCalculatedGovVoteTotalSupply)

    // govTokenReserve = 4 * 1000 = 4000
    // bankTotalSupply = 2 * 100 = 200
    // unlockedTotal = (10000 - 950) * 0.25 = 2262.5
    // lockedTotal = 950 * 0.33 = 313.5
    // sum = 4000 + 200 + 2262.5 + 313.5 ~= 6775
    expect(govVoteTotalSupply).to.gte(expandTo18Decimals(6775))
  })

  it('should correctly calculate balanceOf', async () => {
    // Enter the bank
    await govToken.approve(bank.address, BANK_BALANCE)
    await bank.enter(BANK_BALANCE)

    // Lock 1,0000 tokens - 95% locked, 5% unlocked
    const lockAmount = govTokenBalance.mul(95).div(100)
    if (debugMessages) console.log(`Locking token balances - amount: ${utils.formatEther(lockAmount.toString())}`)
    await govToken.lock(alice.address, lockAmount)

    // Add first staking pool and enter it
    if (debugMessages) console.log('Transfering govToken ownership to master banker...')
    await govToken.transferOwnership(banker.address)
    if (debugMessages) console.log('Adding new rewards pool...')
    await banker.add(REWARDS_PER_BLOCK, lpPair.address, true)
    if (debugMessages) console.log('Approving master banker...')
    await lpPair.connect(alice).approve(banker.address, expandTo18Decimals(1000))
    if (debugMessages) console.log('Depositing to pool 0...')
    const lpBalance = await lpPair.balanceOf(alice.address)
    await banker.connect(alice).deposit(POOL_ID, lpBalance, ZERO_ADDRESS)

    const govTokenReserve = await govVote.govTokenReserve()
    if (debugMessages) console.log(`govVote -> govTokenReserve: ${utils.formatEther(govTokenReserve.toString())}`)

    const [ userLpTokenAmountInPool ] = await banker.userInfo(POOL_ID, alice.address)
    if (debugMessages) console.log(`masterBanker -> userInfo(0) -> amount: ${utils.formatEther(userLpTokenAmountInPool.toString())}`)

    const lpPairTotalSupply = await lpPair.totalSupply()
    if (debugMessages) console.log(`lpPair -> totalSupply: ${utils.formatEther(lpPairTotalSupply.toString())}`)

    const userShare = userLpTokenAmountInPool.mul(100).div(lpPairTotalSupply)
    if (debugMessages) console.log(`User share: ${utils.formatEther(userShare.toString())}`)

    const pairUnderlying = govTokenReserve.mul(userShare).div(100)
    if (debugMessages) console.log(`Number of underlying gov tokens in lp pair: ${utils.formatEther(pairUnderlying.toString())}`)

    const bankBalance = await bank.balanceOf(alice.address)
    const bankRatio = await govVote.bankRatio()
    const adjustedBankBalance = await govVote.adjustedBankValue(bankBalance)
    if (debugMessages) console.log(`bank -> bankRatio: ${utils.formatEther(bankRatio.toString())}`)
    if (debugMessages) console.log(`bank -> totalBalance: ${utils.formatEther(adjustedBankBalance.toString())}`)
    expect(adjustedBankBalance).to.eq(BANK_BALANCE)

    const govTokenLockOf = await govToken.lockOf(alice.address)
    if (debugMessages) console.log(`govToken -> lockOf: ${utils.formatEther(govTokenLockOf.toString())}`)
    expect(govTokenLockOf).to.eq(lockAmount)

    const currentGovTokenBalance = await govToken.balanceOf(alice.address)
    if (debugMessages) console.log(`govToken -> balanceOf: ${utils.formatEther(currentGovTokenBalance.toString())}`)
    expect(currentGovTokenBalance).to.eq(expandTo18Decimals(7950))

    const expectedCalculatedLpPairPower = pairUnderlying.gt(0) ? pairUnderlying.mul(4) : pairUnderlying
    const expectedCalculatedBankPower = bankBalance.gt(0) ? bankBalance.mul(2) : bankBalance
    const expectedCalculatedLockedBalancePower = govTokenLockOf.gt(0) ? govTokenLockOf.mul(33).div(100) : govTokenLockOf
    const expectedCalculatedBalancePower = currentGovTokenBalance.gt(0) ? currentGovTokenBalance.mul(25).div(100) : currentGovTokenBalance

    // expectedCalculatedLpPairPower =
    //  userShare = (701.803480327648416975 * 100) / 707.1067811865475244
    //  govTokenReserve = 1000.0, underlying = (1000.0 * userShare) / 100 = 990
    //  underlying * _lpMultiplier = 990 * 4 = 3960
    // expectedCalculatedBankPower = bankBalance * _singleStakingMultiplier -> 100 * 2 = 200
    // expectedCalculatedLockedBalancePower = lockedBalance * 33 / 100 -> (950 * 33) / 100 -> 313.5
    // expectedCalculatedBalancePower = currentGovTokenBalance * 25 / 100 -> (1000 * 25) / 100 -> (7950.0 * 25) / 100 -> 1987.5
    // total: ~6460

    const expectedVotingPower = expectedCalculatedLpPairPower
      .add(expectedCalculatedBankPower)
      .add(expectedCalculatedLockedBalancePower)
      .add(expectedCalculatedBalancePower)
    
    const votingPower = await govVote.balanceOf(alice.address)
    
    if (debugMessages) console.log(`Voting Power: ${utils.formatEther(votingPower.toString())}`)
    expect(votingPower).to.gte(expectedVotingPower)
    expect(votingPower).to.gte(expandTo18Decimals(6460))
  })

})
