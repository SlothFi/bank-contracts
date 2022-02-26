import chai, { expect } from 'chai'
import { Contract, ContractFactory, utils } from 'ethers'
import { solidity, MockProvider, deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './shared/utilities'
import { deployGovernanceToken } from './shared/deploy'
import { createLpToken } from './shared/lp'

import Bank from '../build/Bank.json'
import Banker from '../build/Banker.json'
import ERC20Mock from '../build/ERC20Mock.json'
import UniswapV2Factory from '@slothfi/bank-core/build/UniswapV2Factory.json'
import UniswapV2Pair from '@slothfi/bank-core/build/UniswapV2Pair.json'
import BankerExploitMock from '../build/BankerExploitMock.json'

chai.use(solidity)

describe('Banker', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const wallets = provider.getWallets()
  const [alice] = wallets

  let bank: Contract
  let factory: Contract
  let pairFactory: ContractFactory
  let banker: Contract
  let exploiter: Contract
  
  // Tokens
  let govToken: Contract
  let weth: Contract
  let dai: Contract
  let busd: Contract
  let link: Contract

  // Lp pairs
  let pairs: Record<string, Contract>

  beforeEach(async function () {
    this.timeout(0)
    govToken = await deployGovernanceToken(alice)
    await govToken.mint(alice.address, expandTo18Decimals(10000000))

    weth = await deployContract(alice, ERC20Mock, ["WETH", "ETH", expandTo18Decimals(10000000)])
    await weth.transfer(alice.address, expandTo18Decimals(100000))

    bank = await deployContract(alice, Bank, ["MonBank", "xMON", govToken.address])
    factory = await deployContract(alice, UniswapV2Factory, [alice.address])
    pairFactory = new ContractFactory(UniswapV2Pair.abi, UniswapV2Pair.bytecode, alice)
    banker = await deployContract(alice, Banker, [factory.address, bank.address, govToken.address, weth.address])
    exploiter = await deployContract(alice, BankerExploitMock, [banker.address])
    
    busd = await deployContract(alice, ERC20Mock, ["Binance USD", "BUSD", expandTo18Decimals(10000000)])
    await busd.transfer(alice.address, expandTo18Decimals(100000))

    dai = await deployContract(alice, ERC20Mock, ["Dai", "DAI", expandTo18Decimals(10000000)])
    await dai.transfer(alice.address, expandTo18Decimals(100000))

    link = await deployContract(alice, ERC20Mock, ["ChainLink Token", "LINK", expandTo18Decimals(10000000)])
    await link.transfer(alice.address, expandTo18Decimals(100000))

    pairs = {
      'mon/weth': await createLpToken(alice, factory, pairFactory, govToken, weth, expandTo18Decimals(1000), expandTo18Decimals(1000)),
      'mon/busd': await createLpToken(alice, factory, pairFactory, govToken, busd, expandTo18Decimals(1000), expandTo18Decimals(1000)),
      'mon/dai': await createLpToken(alice, factory, pairFactory, govToken, dai, expandTo18Decimals(1000), expandTo18Decimals(1000)),
      //'mon/link': await createLpToken(alice, factory, pairFactory, govToken, link, expandTo18Decimals(1000)),

      'busd/weth': await createLpToken(alice, factory, pairFactory, busd, weth, expandTo18Decimals(1000), expandTo18Decimals(1000)),
      'busd/dai': await createLpToken(alice, factory, pairFactory, busd, dai, expandTo18Decimals(1000), expandTo18Decimals(1000)),
      'busd/link': await createLpToken(alice, factory, pairFactory, busd, link, expandTo18Decimals(1000), expandTo18Decimals(1000)),

      'dai/weth': await createLpToken(alice, factory, pairFactory, dai, weth, expandTo18Decimals(1000), expandTo18Decimals(1000)),
      'dai/link': await createLpToken(alice, factory, pairFactory, dai, link, expandTo18Decimals(1000), expandTo18Decimals(1000)),

      'link/weth': await createLpToken(alice, factory, pairFactory, link, weth, expandTo18Decimals(1000), expandTo18Decimals(1000)),
    }
  })

  describe("initialization", function () {
    it('should have correct values for: factory & bank', async () => {
      expect(await banker.factory()).to.eq(factory.address)
      expect(await banker.bank()).to.eq(bank.address)
    })
  })

  describe("setBridge", function () {
    it("does not allow to set bridge for Governance Token", async function () {
      await expect(banker.setBridge(govToken.address, weth.address)).to.be.revertedWith("Banker: Invalid bridge")
    })

    it("does not allow to set bridge for WETH", async function () {
      await expect(banker.setBridge(weth.address, govToken.address)).to.be.revertedWith("Banker: Invalid bridge")
    })

    it("does not allow to set bridge to itself", async function () {
      await expect(banker.setBridge(busd.address, busd.address)).to.be.revertedWith("Banker: Invalid bridge")
    })

    it("emits correct event on bridge", async function () {
      await expect(banker.setBridge(busd.address, govToken.address))
        .to.emit(banker, "LogBridgeSet")
        .withArgs(busd.address, govToken.address)
    })
  })

  describe("convert", function () {
    it("should convert GovernanceToken/WETH", async function () {
      await pairs['mon/weth'].transfer(banker.address, expandTo18Decimals(100))
      await banker.convert(govToken.address, weth.address)
      
      expect(await govToken.balanceOf(banker.address)).to.equal(0)
      expect(await pairs['mon/weth'].balanceOf(banker.address)).to.equal(0)
      expect(await govToken.balanceOf(bank.address)).to.equal("189756927078123437031")
    })

    it("should convert GovernanceToken/BUSD", async function () {
      await pairs['mon/busd'].transfer(banker.address, expandTo18Decimals(100))
      await banker.convert(govToken.address, busd.address)
      
      expect(await govToken.balanceOf(banker.address)).to.equal(0)
      expect(await pairs['mon/busd'].balanceOf(banker.address)).to.equal(0)
      expect(await govToken.balanceOf(bank.address)).to.equal("189756927078123437031")
    })

    it("should convert using standard ETH path", async function () {
      await pairs['busd/weth'].transfer(banker.address, expandTo18Decimals(100))
      await banker.convert(busd.address, weth.address)
      
      expect(await govToken.balanceOf(banker.address)).to.equal(0)
      expect(await pairs['busd/weth'].balanceOf(banker.address)).to.equal(0)
      expect(await govToken.balanceOf(bank.address)).to.equal("159089825138293427601")
    })

    it("converts LINK/BUSD using a more complex path", async function () {
      await pairs['busd/link'].transfer(banker.address, expandTo18Decimals(100))

      await banker.setBridge(busd.address, govToken.address)
      await banker.setBridge(link.address, busd.address)
      await banker.convert(link.address, busd.address)
      
      expect(await govToken.balanceOf(banker.address)).to.equal(0)
      expect(await pairs['busd/link'].balanceOf(banker.address)).to.equal(0)
      expect(await govToken.balanceOf(bank.address)).to.equal("159089825138293427601")
    })

    it("converts DAI/BUSD using a more complex path", async function () {
      await pairs['busd/dai'].transfer(banker.address, expandTo18Decimals(100))

      await banker.setBridge(busd.address, govToken.address)
      await banker.setBridge(dai.address, busd.address)
      await banker.convert(dai.address, busd.address)
      
      expect(await govToken.balanceOf(banker.address)).to.equal(0)
      expect(await pairs['busd/dai'].balanceOf(banker.address)).to.equal(0)
      expect(await govToken.balanceOf(bank.address)).to.equal("159089825138293427601")
    })

    it("converts DAI/LINK using two step path", async function () {
      this.timeout(0)
      await pairs['dai/link'].transfer(banker.address, expandTo18Decimals(100))

      await banker.setBridge(dai.address, busd.address)
      await banker.setBridge(link.address, dai.address)
      await banker.convert(dai.address, link.address)
      
      expect(await govToken.balanceOf(banker.address)).to.equal(0)
      expect(await pairs['dai/link'].balanceOf(banker.address)).to.equal(0)
      expect(await govToken.balanceOf(bank.address)).to.equal("120096301672136374965")
    }).retries(25)

    it("reverts if caller is not EOA", async function () {
      this.timeout(0)
      await pairs['mon/weth'].transfer(banker.address, expandTo18Decimals(100))
      await expect(exploiter.convert(govToken.address, weth.address)).to.be.revertedWith("Banker: must use EOA")
    })

    it("reverts if pair does not exist", async function () {
      this.timeout(0)
      await expect(banker.convert(link.address, pairs['dai/link'].address)).to.be.revertedWith("Banker: Invalid pair")
    })

    it("reverts if no path is available", async function () {
      this.timeout(0)
      await pairs['busd/link'].transfer(banker.address, expandTo18Decimals(100))
      await expect(banker.convert(link.address, busd.address)).to.be.reverted
      
      expect(await govToken.balanceOf(banker.address)).to.equal(0)
      expect(await pairs['busd/link'].balanceOf(banker.address)).to.equal(expandTo18Decimals(100))
      expect(await govToken.balanceOf(bank.address)).to.equal(0)
    }).retries(25)
  })

  describe("convertMultiple", function () {
    it("should allow to convert multiple", async function () {
      await pairs['dai/weth'].transfer(banker.address, expandTo18Decimals(100))
      await pairs['mon/weth'].transfer(banker.address, expandTo18Decimals(100))

      await banker.convertMultiple([dai.address, govToken.address], [weth.address, weth.address])

      expect(await govToken.balanceOf(banker.address)).to.equal(0)
      expect(await pairs['dai/weth'].balanceOf(banker.address)).to.equal(0)
      expect(await govToken.balanceOf(bank.address)).to.equal("318658355868778309848")
    }).retries(25)
  })

})
