import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { solidity, MockProvider, deployContract } from 'ethereum-waffle'

import { deployGovernanceToken } from './shared/deploy'

import Bank from '../build/Bank.json'

chai.use(solidity)

describe('Bank', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [alice, bob, carol] = provider.getWallets()

  let govToken: Contract
  let bank: Contract

  beforeEach(async () => {
    govToken = await deployGovernanceToken(alice)
    
    await govToken.mint(alice.address, "100")
    await govToken.mint(bob.address, "100")
    await govToken.mint(carol.address, "100")

    bank = await deployContract(alice, Bank, ["MonBank", "xMON", govToken.address])
  })

  it('should have correct values for: name, symbol, decimals, totalSupply, balanceOf', async () => {
    const name = await bank.name()
    expect(name).to.eq('MonBank')
    expect(await bank.symbol()).to.eq('xMON')
    expect(await bank.decimals()).to.eq(18)
    expect(await bank.totalSupply()).to.eq(0)
    expect(await bank.balanceOf(alice.address)).to.eq(0)
  })

  it("should not allow enter if not enough approve", async function () {
    await expect(bank.enter("100")).to.be.revertedWith("ERC20: transfer amount exceeds allowance")
    await govToken.approve(bank.address, "50")
    await expect(bank.enter("100")).to.be.revertedWith("ERC20: transfer amount exceeds allowance")
    await govToken.approve(bank.address, "100")
    await bank.enter("100")
    expect(await bank.balanceOf(alice.address)).to.equal("100")
  })

  it("should not allow withraw more than what you have", async function () {
    await govToken.approve(bank.address, "100")
    await bank.enter("100")
    await expect(bank.leave("200")).to.be.revertedWith("ERC20: burn amount exceeds balance")
  })

  it("should work with more than one participant", async function () {
    await govToken.approve(bank.address, "100")
    await govToken.connect(bob).approve(bank.address, "100")
    // Alice enters and gets 20 shares. Bob enters and gets 10 shares.
    await bank.enter("20")
    await bank.connect(bob).enter("10")
    expect(await bank.balanceOf(alice.address)).to.equal("20")
    expect(await bank.balanceOf(bob.address)).to.equal("10")
    expect(await govToken.balanceOf(bank.address)).to.equal("30")
    // MonBank get 20 more MONs from an external source.
    await govToken.connect(carol).transfer(bank.address, "20")
    // Alice deposits 10 more MONs. She should receive 10*30/50 = 6 shares.
    await bank.enter("10")
    expect(await bank.balanceOf(alice.address)).to.equal("26")
    expect(await bank.balanceOf(bob.address)).to.equal("10")
    // Bob withdraws 5 shares. He should receive 5*60/36 = 8 shares
    await bank.connect(bob).leave("5")
    expect(await bank.balanceOf(alice.address)).to.equal("26")
    expect(await bank.balanceOf(bob.address)).to.equal("5")
    expect(await govToken.balanceOf(bank.address)).to.equal("52")
    expect(await govToken.balanceOf(alice.address)).to.equal("70")
    expect(await govToken.balanceOf(bob.address)).to.equal("98")
  })

})
