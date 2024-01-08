const { ethers, network } = require("hardhat")

// https://github.com/smartcontractkit/full-blockchain-solidity-course-js/discussions/6153
async function mockKeepers() {
    const raffle = await ethers.getContract("Raffle")
    console.log(raffle)
    const checkData = ethers.keccak256(ethers.toUtf8Bytes(""))
    const { upkeepNeeded } = await raffle.checkUpkeep.staticCall(checkData)
    console.log(upkeepNeeded)

    if (upkeepNeeded) {
        const tx = await raffle.performUpkeep(checkData)
        const txReceipt = await tx.wait(1)
        console.log(txReceipt)
        // const requestId = txReceipt.events[1].args.requestId
        const requestId = txReceipt.logs[1].args.requestId
        console.log(Number(requestId))
        console.log(`Performed upkeep with RequestId: ${requestId}`)
        if (network.config.chainId == 31337) {
            await mockVrf(Number(requestId), raffle)
        }
    } else {
        console.log("No upkeep needed!")
    }
}

async function mockVrf(requestId, raffle) {
    console.log("We on a local network? Ok let's pretend...")
    console.log(requestId)
    console.log(raffle.target)
    const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
    await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, raffle.target)
    console.log("Responded!")
    const recentWinner = await raffle.getRecentWinner()
    console.log(`The winner is: ${recentWinner}`)
}

mockKeepers()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)

        process.exit(1)
    })
