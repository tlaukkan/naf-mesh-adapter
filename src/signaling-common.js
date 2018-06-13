exports.HandshakeRequest = class {
    constructor(email, secret) {
        this.typeName = 'HandshakeRequest'
        this.email = email
        this.secret = secret
    }
}

exports.HandshakeResponse = class {
    constructor(id, error) {
        this.typeName = 'HandshakeResponse'
        this.id = id
        this.error = error
    }
}

exports.Message = class {
    constructor(sourceId, targetId, contentType, contentJson) {
        this.typeName = 'Message'
        this.sourceId = sourceId
        this.targetId = targetId
        this.contentType = contentType
        this.contentJson = contentJson
    }
}
