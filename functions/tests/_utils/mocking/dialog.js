const sinon = require('sinon');

module.exports = () => ({
  ask: sinon.spy(),
  playSong: sinon.spy(),
  tell: sinon.spy(),
});
