'use strict';
// Caller-facing restrictions, not a server privilege boundary. No destructive APIs.
function fenceClient(client, { database, names, uri }, evidence) {
  client.on?.('error', () => { evidence.connectionError = true; });
  const databases = new WeakSet(), collectionSet = new Set(names);
  const deny = () => { evidence.forbiddenAttempt = true; throw Error('Forbidden integration database operation'); };
  const db = client.db.bind(client);
  client.db = (name = database, ...args) => {
    if (name !== database) return deny();
    const value = db(name, ...args);
    if (databases.has(value)) return value; databases.add(value);
    const collection = value.collection.bind(value), create = value.createCollection.bind(value), admin = value.admin.bind(value);
    value.collection = (name, ...options) => {
      if (!collectionSet.has(name)) return deny();
      const item = collection(name, ...options);
      for (const method of ['drop', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'createIndex', 'createIndexes', 'dropIndex', 'dropIndexes', 'bulkWrite', 'replaceOne', 'findOneAndReplace']) item[method] = deny;
      for (const method of ['updateOne', 'updateMany', 'findOneAndUpdate']) {
        const original = item[method].bind(item);
        item[method] = (...args) => name === 'express_cases' ? original(...args) : deny();
      }
      const aggregate = item.aggregate.bind(item);
      item.aggregate = (pipeline, ...args) => {
        const safe = stages => stages.every(stage => !stage.$out && !stage.$merge &&
          (!stage.$lookup || collectionSet.has(stage.$lookup.from)) &&
          (!stage.$unionWith || collectionSet.has(typeof stage.$unionWith === 'string' ? stage.$unionWith : stage.$unionWith.coll)) &&
          (!stage.$lookup?.pipeline || safe(stage.$lookup.pipeline)) &&
          (!stage.$unionWith?.pipeline || safe(stage.$unionWith.pipeline)) &&
          (!stage.$facet || Object.values(stage.$facet).every(safe)));
        if (!safe(pipeline)) return deny(); return aggregate(pipeline, ...args);
      };
      return item;
    };
    value.createCollection = (name, ...args) => collectionSet.has(name) ? create(name, ...args) : deny();
    value.dropDatabase = deny; value.dropCollection = deny; value.command = deny;
    value.admin = () => { const metadata = admin(); const command = metadata.command.bind(metadata);
      metadata.command = (input, ...args) => Object.keys(input).every(key => ['hello', 'connectionStatus', 'showPrivileges'].includes(key)) ? command(input, ...args) : deny();
      return metadata;
    };
    return value;
  };
  return client;
}
function fencedDriver(driver, config, evidence) {
  class Client extends driver.MongoClient {
    constructor(uri, options) {
      if (uri !== config.uri || options?.dbName !== config.database) throw Error('Integration client identity mismatch');
      super(uri, options); fenceClient(this, config, evidence);
    }
    async connect() {
      await super.connect();
      if (config.authorize) await config.authorize(this);
      return this;
    }
  }
  return { ...driver, MongoClient: Client };
}
module.exports = { fenceClient, fencedDriver };
