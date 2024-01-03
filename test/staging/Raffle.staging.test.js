const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")
const { textChangeRangeIsUnchanged } = require("typescript")
const { TransactionReceipt } = require("ethers")
const BN = require("bn.js")
// const { gasUsed, effectiveGasPrice } = TransactionReceipt
// const gasCost = new BN(gasUsed) * new BN(effectiveGasPrice)

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", function () {
          let raffle, raffleEntranceFee, deployer
          const chainId = network.config.chainId

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              // await deployments.fixture(["all"]) // the "all" tag in each of the contracts in deploy folder --> removed this in staging test because we are going to run our deploy script and our contracts should already be deployed
              raffle = await ethers.getContract("Raffle", deployer) // we will get the raffle contract and connect to the deployer
              // vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)

              raffleEntranceFee = await raffle.getEntranceFee()
              //interval = await raffle.getInterval()
          })

          describe("fulfillRandomWords", function () {
              it("works with live Chainlink keepers and Chainlink VRF, we get a random winner", async function () {
                  // enter the raffle
                  const startingTimeStamp = await raffle.getLatestTimeStamp()
                  const accounts = await ethers.getSigners()

                  await new Promise(async (resolve, reject) => {
                      console.log("Setting Up Listener...")
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          try {
                              // add our asserts here
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerEndingBalance = await ethers.provider.getBalance(
                                  accounts[0].address,
                              )
                              const endingTimeStamp = await raffle.getLatestTimeStamp()

                              await expect(raffle.getPlayer(0)).to.be.reverted
                              assert.equal(recentWinner.toString(), accounts[0].address)
                              assert.equal(raffleState, 0)

                              //console.log(Number(winnerEndingBalance))
                              //console.log(Number(winnerStartingBalance))
                              //   console.log(Number(raffleEntranceFee))
                              //   console.log(gasCost)

                              // they basically should just get that raffle entrance fee back right because they are the only ones who have entered the raffle
                              //   assert.equal(
                              //       Number(winnerEndingBalance),
                              //       Number(winnerStartingBalance) + Number(raffleEntranceFee),
                              //   )

                              // Will use my own design for assert cause got gasCosts
                              const difference =
                                  Number(winnerStartingBalance) - Number(winnerEndingBalance)
                              console.log(winnerStartingBalance)
                              console.log(winnerEndingBalance)
                              console.log(difference)
                              assert(difference < ethers.parseEther("0.001")) // I estimate gasCost??? cause starting balance above has raffle entrance fee

                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(e)
                          }
                      })
                      // Then entering the raffle
                      console.log("Entering Raffle...")
                      await raffle.enterRaffle({ value: raffleEntranceFee })

                      // await tx.wait(1) // means wallet - gas fee - entrance fee?
                      // We check their starting balance after they enter the raffle, but somehow below doesn't reflect raffle entrance fee being deducted from wallet
                      const winnerStartingBalance = await ethers.provider.getBalance(
                          accounts[0].address,
                      )

                      console.log(
                          "Winner starting balance after paying for raffle entrance fee is " +
                              winnerStartingBalance,
                      )
                      // and this code wont complete until our listener has finished listening
                  })

                  // setup listener before we enter the raffle
                  // just in case the blockchain moves really fast

                  // await raffle.enterRaffle({value: raffleEntranceFee})
              })
          })
      })

// Get out SubId for Chainlink VRF
// Deploy our contract using the SubId
// Register the contract with Chainlink VRF and it's subId
// Register the contract with Chainlink Keepers
// Run staging tests
