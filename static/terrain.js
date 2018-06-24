/* global AFRAME, THREE */

if (typeof AFRAME === 'undefined') {
    throw new Error('AFRAME not available.');
}

if (typeof THREE === 'undefined') {
    throw new Error('THREE not available.');
}

AFRAME.registerComponent('terrain', {
    schema: {
        width: {type: 'number', default: 1},
        height: {type: 'number', default: 1},
        depth: {type: 'number', default: 1},
        opacity: {type: 'number', default: 1},
        color: {type: 'color', default: '#AAA'}
    },

    /**
     * Initial creation and setting of the mesh.
     */
    init: function () {
        var data = this.data;
        var el = this.el;

        // Create geometry.
        //this.geometry = new THREE.BoxBufferGeometry(data.width, data.height, data.depth);
        // Create material.
        //this.material = new THREE.MeshStandardMaterial({color: data.color});
        // Create mesh.
        //this.mesh = new THREE.Mesh(this.geometry, this.material);

        this.geometry = new THREE.Geometry();

        const dx = Math.cos(Math.PI / 3);
        const dy = Math.sin(Math.PI / 3);

        var getVector3 = (i, j) => {
            return new THREE.Vector3(i + j * dx, j * dy, 0)
        }

        var addFace = (i, j, v, primary) => {
            if (primary) {
                this.geometry.vertices.push(
                    getVector3(i, j),
                    getVector3(i + 1, j),
                    getVector3(i, j + 1)
                );
            } else {
                this.geometry.vertices.push(
                    getVector3(i, j + 1),
                    getVector3(i + 1, j),
                    getVector3(i + 1, j + 1)
                );
            }

            var face = new THREE.Face3(v + 0, v + 1, v + 2);
            face.vertexColors[0] = new THREE.Color(0xff0000); // red
            face.vertexColors[1] = new THREE.Color(0x00ff00); // green
            face.vertexColors[2] = new THREE.Color(0x0000ff); // blue
            this.geometry.faces.push(face);
        }

        var v = 0
        for (var i = 0; i < 9; i++) {
            for (var j = 0; j < 9; j++) {
                if (i + j < 9) {
                    addFace(i, j, v, true)
                    v += 3;
                }
                if (i + j < 8) {
                    addFace(i, j, v, false)
                    v += 3;
                }
            }
        }

        this.material = new THREE.MeshBasicMaterial({vertexColors: THREE.VertexColors});
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        el.setObject3D('mesh', this.mesh);
    }
});



AFRAME.registerPrimitive('a-terrain', {
    defaultComponents: {
        terrain: {},
        rotation: {x: -90, y: 0, z: 0}
    },
    mappings: {
        width: 'terrain.width',
        height: 'terrain.height',
        depth: 'terrain.depth',
        color: 'terrain.color',
        opacity: 'terrain.opacity'
    }
});