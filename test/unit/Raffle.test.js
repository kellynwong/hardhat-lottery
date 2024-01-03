const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", function () {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
          const chainId = network.config.chainId

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"]) // the "all" tag in each of the contracts in deploy folder
              raffle = await ethers.getContract("Raffle", deployer) // we will get the raffle contract and connect to the deployer
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })
          describe("constructor", function () {
              // removed async word because describe blocks actually don't realise and can't recognize and can't work with promises so having the async word actually doesn't do anything
              it("initializes the raffle correctly", async function () {
                  // ideally we make our tests have just 1 assert per "it"
                  const raffleState = await raffle.getRaffleState()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })

          describe("enterRaffle", function () {
              it("reverts when you don't pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__NotEnoughETHEntered",
                  )
              })

              it("records players when they enter", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee }) //--> deployer (a wallet that creates a contract) here has been correctly recorded; so since now we are connected to the deployer, we will just make sure that deployer actually is in our contract
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, deployer)
              })

              it("emits event on enter", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter",
                  )
              })
              it("doesn't allow entrance when raffle is calculating", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  // we pretend to be a chainlink keeper
                  await raffle.performUpkeep("0x")
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee }),
                  ).to.be.revertedWithCustomError(raffle, "Raffle__NotOpen")
              })
          })

          describe("checkUpkeep", function () {
              it("returns false if people haven't sent any ETH", async function () {
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x") // use callStatic to simulate calling this transaction and seeing what it will respond with
                  // use {upkeepNeeded} to extrapolate just the upkeepNeeded out of this return (as it returns both upkeepNeeded and the bytes perform data)
                  assert(!upkeepNeeded)
              })

              it("returns false if raffle isn't open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  // we pretend to be a chainlink keeper
                  await raffle.performUpkeep("0x") // hardhat will be smart enough to know that this "0x" gets transform into a blank bytes object
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })

              it("returns false if enough time hasn't passed", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) - 5])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                  assert(!upkeepNeeded)
              })

              it("returns true if enough time has passed, has players, eth, and is open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                  assert(upkeepNeeded)
              })
          })

          describe("performUpkeep", function () {
              it("it can only run if checkupkeep is true", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  const tx = await raffle.performUpkeep("0x")
                  assert(tx)
              })

              it("reverts when checkupkeep is false", async function () {
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__UpkeepNotNeeded",
                  )
              })

              it("updates the raffle state, emits an event, and calls the vrf coordinator", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])

                  const txResponse = await raffle.performUpkeep("0x")
                  const txReceipt = await txResponse.wait(1)
                  const raffleState = await raffle.getRaffleState()

                  const requestId = txReceipt.logs[1].args.requestId
                  // console.log(typeof requestId)
                  assert(Number(requestId) > 0)
                  assert(raffleState.toString() == "1")
              })
          })

          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
              })

              it("can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.target), // reverts if not fulfilled
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.target), // reverts if not fulfilled // not sure why this line exist? Thought if there exist 1, it shouldn't revert this?
                  ).to.be.revertedWith("nonexistent request")
                  console.log(raffle.target)
              })

              // Wayyyy to big //////////////////////////////////////////////
              it("picks a winner, resets the lottery, and sends money", async () => {
                  const additionalEntrants = 3
                  const startingAccountIndex = 2 // deployer = 0 and player 1 defined in 1st beforeEach() at the top (total 5 players)
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                  }
                  const startingTimeStamp = await raffle.getLatestTimeStamp()
                  // performUpkeep (mock being chainlink keepers)
                  // fulfillRandomWords (mock being the chainlink vrf)
                  // we will have to wait for the fulfillRandomWords to be called

                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("Found the event!")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              console.log(recentWinner) //account 2
                              console.log(accounts[0].address)
                              console.log(accounts[1].address)
                              console.log(accounts[2].address)
                              console.log(accounts[3].address)

                              const raffleState = await raffle.getRaffleState()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()
                              const numPlayers = await raffle.getNumberOfPlayers()

                              const winnerEndingBalance = await ethers.provider.getBalance(
                                  accounts[2].address,
                              )
                              //console.log(winnerEndingBalance)

                              console.log(Number(numPlayers))
                              console.log(Number(raffleState))
                              console.log(Number(endingTimeStamp))
                              console.log(Number(startingTimeStamp))

                              assert.equal(Number(numPlayers), 0)
                              console.log("numPlayers asserted")
                              assert.equal(Number(raffleState), 0)
                              console.log("raffleState asserted")
                              assert(Number(endingTimeStamp) > Number(startingTimeStamp))
                              console.log("timeStamp asserted")

                              //   const sum =
                              //       Number(winnerStartingBalance) +
                              //       (Number(raffleEntranceFee) * additionalEntrants +
                              //           Number(raffleEntranceFee))

                              //   console.log(Number(winnerEndingBalance))
                              //   console.log(Number(winnerStartingBalance))
                              //   console.log(Number(raffleEntranceFee))
                              //   console.log(additionalEntrants)
                              //   console.log(Number(raffleEntranceFee))

                              assert.equal(
                                  Number(winnerEndingBalance),
                                  Number(winnerStartingBalance) +
                                      (Number(raffleEntranceFee) * additionalEntrants +
                                          Number(raffleEntranceFee)),
                              )

                              resolve() // if try passes, resolves the promise
                          } catch (e) {
                              reject(e) // if try fails, rejects the primise
                          }
                      })

                      // Setting up the listener

                      // below, we will fire the event, and the listener will pick it up, and resolve
                      const tx = await raffle.performUpkeep("0x")
                      const txReceipt = await tx.wait(1)

                      const winnerStartingBalance = await ethers.provider.getBalance(
                          accounts[2].address,
                      )

                      console.log(txReceipt)
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.logs[1].args.requestId,
                          raffle.target,
                      )
                  })
              })
          })
      })
