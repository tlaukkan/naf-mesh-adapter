exports.Peer = class {
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

exports.DataTypes = {
    FIND_PEERS: 'FIND_PEERS',
    CHANGED_PEERS: 'CHANGED_PEERS'
};

exports.PeerPosition = class {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

exports.PeerStatus = {
    AVAILABLE: 'AVAILABLE',
    UNAVAILABLE: 'UNAVAILABLE'
};

exports.PeerData = class {
    constructor(url, status, position) {
        this.url = url;
        this.status = status;
        this.position = position;
    }
}

exports.FindPeers = class {
    constructor(position, range) {
        this.position = position;
        this.range = range;
    }
}

exports.ChangedPeers = class {
    constructor(peerDataList) {
        this.peerDataList = peerDataList;
    }
}