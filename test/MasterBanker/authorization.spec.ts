import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { solidity, MockProvider, deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from '../shared/utilities'

import { deployMasterBanker, deployGovernanceToken } from '../shared/deploy'

chai.use(solidity)

const REWARDS_PER_BLOCK = expandTo18Decimals(1000)
const REWARDS_START_BLOCK = 0
const HALVING_AFTER_BLOCK_COUNT = 45360

describe('MasterBanker::Authorization', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const wallets = provider.getWallets()
  const [alice, bob, carol, minter, dev, liquidityFund, communityFund, founderFund] = wallets

  let govToken: Contract
  let banker: Contract
  
  beforeEach(async () => {
    govToken = await deployGovernanceToken(alice)
    // 1000 MON per block, rewards start at block 0, rewards are halved after every 45360 blocks
    banker = await deployMasterBanker(wallets, govToken, REWARDS_PER_BLOCK, REWARDS_START_BLOCK, HALVING_AFTER_BLOCK_COUNT)
  })

  it("should allow the owner to reclaim ownership of the Mon token", async function () {
    expect(await govToken.transferOwnership(banker.address))

    expect(await govToken.owner()).to.be.equal(banker.address)

    await expect(banker.reclaimTokenOwnership(alice.address))
      .to.emit(govToken, 'OwnershipTransferred')
      .withArgs(banker.address, alice.address)
    
    expect(await govToken.owner()).to.be.equal(alice.address)
  })

  it("should allow authorized users to reclaim ownership of the Mon token", async function () {
    await banker.addAuthorized(bob.address)

    expect(await govToken.transferOwnership(banker.address))

    expect(await govToken.owner()).to.be.equal(banker.address)

    await expect(banker.connect(bob).reclaimTokenOwnership(bob.address))
      .to.emit(govToken, 'OwnershipTransferred')
      .withArgs(banker.address, bob.address)
    
    expect(await govToken.owner()).to.be.equal(bob.address)
  })

  it("unauthorized users shouldn't be able to reclaim ownership of the token back from MasterChef", async function () {
    expect(await govToken.transferOwnership(banker.address))
    expect(await govToken.owner()).to.be.equal(banker.address)

    await expect(banker.connect(bob).reclaimTokenOwnership(bob.address)).to.be.reverted
    
    expect(await govToken.owner()).to.be.equal(banker.address)
  })

  it("should allow only authorized users to update the developer rewards address", async function () {
    expect(await banker.devaddr()).to.equal(dev.address)

    await expect(banker.connect(bob).dev(bob.address)).to.be.reverted

    await banker.addAuthorized(dev.address)
    await banker.connect(dev).dev(bob.address)
    expect(await banker.devaddr()).to.equal(bob.address)

    await banker.addAuthorized(bob.address)
    await banker.connect(bob).dev(alice.address)
    expect(await banker.devaddr()).to.equal(alice.address)
  })

  it("should allow only authorized users to update the liquidity provider rewards address", async function () {
    expect(await banker.liquidityaddr()).to.equal(liquidityFund.address)

    await expect(banker.connect(bob).lpUpdate(bob.address)).to.be.reverted

    await banker.addAuthorized(liquidityFund.address)
    await banker.connect(liquidityFund).lpUpdate(bob.address)
    expect(await banker.liquidityaddr()).to.equal(bob.address)

    await banker.addAuthorized(bob.address)
    await banker.connect(bob).lpUpdate(alice.address)
    expect(await banker.liquidityaddr()).to.equal(alice.address)
  })

  it("should allow only authorized users to update the community fund rewards address", async function () {
    expect(await banker.comfundaddr()).to.equal(communityFund.address)

    await expect(banker.connect(bob).comUpdate(bob.address)).to.be.reverted

    await banker.addAuthorized(communityFund.address)
    await banker.connect(communityFund).comUpdate(bob.address)
    expect(await banker.comfundaddr()).to.equal(bob.address)

    await banker.addAuthorized(bob.address)
    await banker.connect(bob).comUpdate(alice.address)
    expect(await banker.comfundaddr()).to.equal(alice.address)
  })

  it("should allow only authorized users to update the founder rewards address", async function () {
    expect(await banker.founderaddr()).to.equal(founderFund.address)

    await expect(banker.connect(bob).founderUpdate(bob.address)).to.be.reverted

    await banker.addAuthorized(founderFund.address)
    await banker.connect(founderFund).founderUpdate(bob.address)
    expect(await banker.founderaddr()).to.equal(bob.address)

    await banker.addAuthorized(bob.address)
    await banker.connect(bob).founderUpdate(alice.address)
    expect(await banker.founderaddr()).to.equal(alice.address)
  })
})
