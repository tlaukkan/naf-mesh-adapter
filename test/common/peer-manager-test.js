// eslint-disable-next-line no-unused-vars
const assert = require('assert');

const PeerManager = require('../../src/peer-manager').PeerManager;
const PeerStatus = require('../../src/mesh-adapter-model').PeerStatus;
const PeerPosition = require('../../src/mesh-adapter-model').PeerPosition;
const PeerData = require('../../src/mesh-adapter-model').PeerData;

describe('peer-manager', function() {
    it('test-peer-management', function() {

        const manager = new PeerManager();

        const p0 = new PeerData('0', PeerStatus.AVAILABLE, new PeerPosition(0, 0, 0));
        const p1 = new PeerData('1', PeerStatus.AVAILABLE, new PeerPosition(10, 0, 0));
        const p2 = new PeerData('2', PeerStatus.AVAILABLE, new PeerPosition(20, 0, 0));
        const p3 = new PeerData('3', PeerStatus.UNAVAILABLE, new PeerPosition(30, 0, 0));
        const p5 = new PeerData('6', PeerStatus.AVAILABLE, new PeerPosition(-5, 0, 0));

        const v1 = manager.peekChangedPeers('6', new PeerPosition(0,0,0), 10,[p0, p1, p2, p3, p5])
        assert.equal(v1.length, 2)
        assert.equal(v1[0].url, '0')
        assert.equal(v1[0].status, PeerStatus.AVAILABLE)
        assert.equal(v1[1].url, '1')
        assert.equal(v1[1].status, PeerStatus.AVAILABLE)

        const c1 = manager.peersChanged('6',[p0, p1, p2, p3, p5])
        assert.equal(c1.length, 3)
        assert.equal(c1[0].url, '0')
        assert.equal(c1[0].status, PeerStatus.AVAILABLE)
        assert.equal(c1[1].url, '1')
        assert.equal(c1[1].status, PeerStatus.AVAILABLE)
        assert.equal(c1[2].url, '2')
        assert.equal(c1[2].status, PeerStatus.AVAILABLE)

        const f1 = manager.findPeersChanged('6', new PeerPosition(0,0,0), 10, true)
        assert.equal(f1.length, 2)
        assert.equal(f1[0].url, '0')
        assert.equal(f1[0].status, PeerStatus.AVAILABLE)
        assert.equal(f1[1].url, '1')
        assert.equal(f1[1].status, PeerStatus.AVAILABLE)

        const v2 = manager.peekChangedPeers('6', new PeerPosition(0,0,0), 10, [new PeerData('1', PeerStatus.UNAVAILABLE, new PeerPosition(10, 0, 0))])
        assert.equal(v2.length, 1)
        assert.equal(v2[0].url, '1')
        assert.equal(v2[0].status, PeerStatus.UNAVAILABLE)

        const c2 = manager.peersChanged('6',[new PeerData('1', PeerStatus.UNAVAILABLE, new PeerPosition(10, 0, 0))])
        assert.equal(c2.length, 3)
        assert.equal(c2[0].url, '0')
        assert.equal(c2[0].status, PeerStatus.AVAILABLE)
        assert.equal(c2[1].url, '1')
        assert.equal(c2[1].status, PeerStatus.UNAVAILABLE)
        assert.equal(c2[2].url, '2')
        assert.equal(c2[2].status, PeerStatus.AVAILABLE)

        const f2 = manager.findPeersChanged('6', new PeerPosition(0,0,0), 10, true)
        assert.equal(f2.length, 1)
        assert.equal(f2[0].url, '1')
        assert.equal(f2[0].status, PeerStatus.UNAVAILABLE)

        const c3 = manager.peersChanged('6',[new PeerData('3', PeerStatus.AVAILABLE, new PeerPosition(0, 10, 0))])
        assert.equal(c3.length, 3)
        assert.equal(c3[0].url, '0')
        assert.equal(c3[0].status, PeerStatus.AVAILABLE)
        assert.equal(c3[1].url, '2')
        assert.equal(c3[1].status, PeerStatus.AVAILABLE)
        assert.equal(c3[2].url, '3')
        assert.equal(c3[2].status, PeerStatus.AVAILABLE)

        const f3 = manager.findPeersChanged('6', new PeerPosition(0,0,0), 10, true)
        assert.equal(f3.length, 1)
        assert.equal(f3[0].url, '3')
        assert.equal(f3[0].status, PeerStatus.AVAILABLE)

        const c4 = manager.peersChanged('6',[new PeerData('4', PeerStatus.AVAILABLE, new PeerPosition(0, 0, 10))])
        assert.equal(c4.length, 4)
        assert.equal(c4[0].url, '0')
        assert.equal(c4[0].status, PeerStatus.AVAILABLE)
        assert.equal(c4[1].url, '2')
        assert.equal(c4[1].status, PeerStatus.AVAILABLE)
        assert.equal(c4[2].url, '3')
        assert.equal(c4[2].status, PeerStatus.AVAILABLE)
        assert.equal(c4[3].url, '4')
        assert.equal(c4[3].status, PeerStatus.AVAILABLE)

        const f4 = manager.findPeersChanged('6', new PeerPosition(0,0,0), 10, true)
        assert.equal(f4.length, 1)
        assert.equal(f4[0].url, '4')
        assert.equal(f4[0].status, PeerStatus.AVAILABLE)

        const c5 = manager.peersChanged('6',[new PeerData('5', PeerStatus.AVAILABLE, new PeerPosition(30, 0, 0))])
        assert.equal(c5.length, 5)
        assert.equal(c5[0].url, '0')
        assert.equal(c5[0].status, PeerStatus.AVAILABLE)
        assert.equal(c5[1].url, '2')
        assert.equal(c5[1].status, PeerStatus.AVAILABLE)
        assert.equal(c5[2].url, '3')
        assert.equal(c5[2].status, PeerStatus.AVAILABLE)
        assert.equal(c5[3].url, '4')
        assert.equal(c5[3].status, PeerStatus.AVAILABLE)
        assert.equal(c5[4].url, '5')
        assert.equal(c5[4].status, PeerStatus.AVAILABLE)

        const f5 = manager.findPeersChanged('6', new PeerPosition(0,0,0), 10, true)
        assert.equal(f5.length, 0)
    })

})
