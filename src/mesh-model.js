exports. Peer = class {
    constructor(peerUrl) {
        const lastIndex = peerUrl.lastIndexOf('/');
        this.peerUrl = peerUrl
        this.signalingServerUrl = peerUrl.substr(0, lastIndex)
        this.peerId = peerUrl.substr(lastIndex + 1)
    }
}

exports.DataMessage = class {
    constructor(dataType, data) {
        this.dataType = dataType
        this.data = data
    }
}