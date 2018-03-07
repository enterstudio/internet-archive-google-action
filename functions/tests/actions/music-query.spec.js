const {expect} = require('chai');
const rewire = require('rewire');
const sinon = require('sinon');

const action = rewire('../../actions/music-query');
const {getSlot, getSlots, hasSlot} = require('../../state/query');
const playlist = require('../../state/playlist');

const mockApp = require('../_utils/mocking/app');
const mockDialog = require('../_utils/mocking/dialog');
const mockAlbumsFeeder = require('../_utils/mocking/feeders/albums');

const slotSchemeWithMultipleCases = require('./fixtures/slots-scheme-with-multiple-cases');
const slotSchemeWithOneCase = require('./fixtures/slots-scheme-with-one-case');

describe('actions', () => {
  let app;
  let dialog;
  let getSuggestionProviderForSlots;
  let provider;

  beforeEach(() => {
    app = mockApp({
      argument: {
        collection: 'live',
        creatorId: 'the-band',
        coverage: 'ny',
      },
    });
    dialog = mockDialog();
    action.__set__('dialog', dialog);

    provider = sinon.stub().returns(Promise.resolve({
      items: [
        {coverage: 'barcelona'},
        {coverage: 'london'},
        {coverage: 'lviv'},
        {coverage: 'tokyo'},
      ],
    }));
    getSuggestionProviderForSlots = sinon.stub().returns(provider);
    action.__set__('getSuggestionProviderForSlots', getSuggestionProviderForSlots);
  });

  describe('music query', () => {
    beforeEach(() => {
      action.__set__('availableSchemes', slotSchemeWithMultipleCases);
    });

    describe('multiple slot schemes', () => {
      it('should get slot scheme without conditions', () => {
        app = mockApp({
          argument: {
            // category: 'plate',
          },
        });
        return action.handler(app)
          .then(() => {
            expect(dialog.ask).to.have.been.calledOnce;
            expect(dialog.ask.args[0][1])
              .to.have.property('speech')
              .to.include('Which album?');
          });
      });

      it('should get 1st which matches conditions', () => {
        app = mockApp({
          argument: {
            category: 'plates',
          },
        });
        return action.handler(app)
          .then(() => {
            expect(dialog.ask).to.have.been.calledOnce;
            expect(dialog.ask.args[0][1])
              .to.have.property('speech')
              .to.include('Which plate?');
          });
      });

      it('should recieve value for old slot', () => {
        app = mockApp({
          argument: {
            category: 'plates',
            album: 'album1'
          },
        });
        return action.handler(app)
          .then(() => {
            expect(getSlot(app, 'album')).to.be.equal('album1');
          });
      });

      it('should recieve value for new slot', () => {
        app = mockApp({
          argument: {
            category: 'plates',
            plate: 'plate1'
          },
        });
        return action.handler(app)
          .then(() => {
            expect(getSlot(app, 'plate')).to.be.equal('plate1');
          });
      });
    });

    describe('single slot scheme', () => {
      beforeEach(() => {
        action.__set__('availableSchemes', slotSchemeWithOneCase);
      });

      describe('acknowledge', () => {
        it('should acknowledge are received values', () => {
          app = mockApp({
            argument: {
              coverage: 'Kharkiv',
              year: 2017,
            },
          });
          return action.handler(app)
            .then(() => {
              expect(dialog.ask).to.have.been.calledOnce;
              expect(dialog.ask.args[0][1])
                .to.have.property('speech')
                .to.include('Kharkiv 2017 - great choice!');
            });
        });

        it('should substitute resolved slots', () => {
          app = mockApp({
            argument: {
              creatorId: 'bandId',
            },
          });

          const handler = sinon.stub().returns(Promise.resolve({title: 'Grateful Dead'}));

          action.__set__('getRequiredExtensionHandlers', () => [{
            handler,
            name: 'creator',
            extType: 'resolvers',
          }]);

          return action.handler(app)
            .then(() => {
              expect(handler.args[0][0])
                .to.have.property('creatorId', 'bandId');
              expect(dialog.ask).to.have.been.calledOnce;
              expect(dialog.ask.args[0][1])
                .to.have.property('speech')
                .to.include('Ok! Lets go with Grateful Dead band!');
            });
        });

        it('should prompt to the next slot with a question', () => {
          app = mockApp({
            argument: {
              collection: 'live',
            },
          });
          return action.handler(app)
            .then(() => {
              expect(dialog.ask).to.have.been.calledOnce;
              expect(dialog.ask.args[0][1])
                .to.have.property('speech')
                .to.include('What artist would you like to listen to, e.g. barcelona, london or lviv?');
            });
        });
      });

      describe('defaults', () => {
        it(`should automatically populate to user state if we don't have it yet there`, () => {
          app = mockApp({
            argument: {},
          });
          return action.handler(app)
            .then(() => {
              expect(getSlot(app, 'sort')).to.be.equal('random');
            });
        });

        it(`shouldn't populate to user state if we already have this slot`, () => {
          app = mockApp({
            argument: {
              sort: 'the-best',
            },
          });
          return action.handler(app)
            .then(() => {
              expect(getSlot(app, 'sort')).to.be.equal('the-best');
            });
        });
      });

      describe('fulfillment', () => {
        let albumsFeeder;
        let feeders;

        beforeEach(() => {
          albumsFeeder = mockAlbumsFeeder();
          feeders = {
            getByName: sinon.stub().returns(albumsFeeder),
          };
          action.__set__('feeders', feeders);
        });

        it(`shouldn't activate when we don't have enough filled slots`, () => {
          app = mockApp({
            argument: {
              collection: 'live',
              creatorId: 'the-band',
              // missed slots:
              // coverage: 'ny',
              // year: 2018,
            },
          });
          return action.handler(app)
            .then(() => {
              expect(feeders.getByName).to.have.not.been.called;
            });
        });

        it(`should activate when we have enough filled slots`, () => {
          app = mockApp({
            argument: {
              collection: 'live',
              creatorId: 'the-band',
              coverage: 'ny',
              year: 2018,
            },
          });
          return action.handler(app)
            .then(() => {
              expect(feeders.getByName).to.have.been.calledWith('albums');
              expect(playlist.getFeeder(app)).to.be.equal('albums');
              expect(albumsFeeder.build).to.have.been.calledWith(
                app,
                action.__get__('querySlots'),
                action.__get__('playlist')
              );
              expect(albumsFeeder.isEmpty).to.have.been.calledWith(
                app,
                action.__get__('querySlots'),
                action.__get__('playlist')
              );
              expect(albumsFeeder.getCurrentItem).to.have.been.calledWith(
                app,
                action.__get__('querySlots'),
                action.__get__('playlist')
              );
            });
        });
      });

      describe('presets', () => {
        it('should fill slots', () => {
          app = mockApp({
            argument: {
              preset: 'your-favourite-album',
            },
          });
          return action.handler(app)
            .then(() => {
              expect(getSlot(app, 'creatorId')).to.be.equal('one-band');
              expect(getSlot(app, 'coverage')).to.be.equal('NY');
              expect(getSlot(app, 'year')).to.be.equal(1999);
            });
        });

        it('should be able to skip some slots', () => {
          app = mockApp({
            argument: {
              preset: 'your-favourite-albums',
            },
          });
          return action.handler(app)
            .then(() => {
              expect(getSlot(app, 'creatorId')).to.be.equal('one-band');
              expect(getSlot(app, 'year')).to.be.equal(1999);
              expect(hasSlot(app, 'coverage')).to.be.true;
              expect(getSlots(app)).to.be.deep.equal({
                creatorId: 'one-band',
                sort: 'random',
                year: 1999,
              });
            });
        });

        // TODO:
        // is not implemented yet
        // https://github.com/internetarchive/internet-archive-google-action/issues/93
        // it could be quite a complex issue
        xit('should acknowledge for chosen preset', () => {
          app = mockApp({
            argument: {
              preset: 'your-favourite-album',
            },
          });
          return action.handler(app)
            .then(() => {
              expect(dialog.ask).to.have.been.calledOnce;
              expect(dialog.ask.args[0][1])
                .to.have.property('speech')
                .to.include(
                  `Cool! You've chosen my favourite album.`
                );
            });
        });
      });

      describe('slot updater', () => {
        it('should fill single slot', () => {
          app = mockApp({
            argument: {
              collection: 'live',
            },
          });
          return action.handler(app)
            .then(() => {
              expect(getSlot(app, 'collection')).to.be.equal('live');
              expect(getSlot(app, 'creatorId')).to.be.undefined;
              expect(getSlot(app, 'coverage')).to.be.undefined;
              expect(getSlot(app, 'year')).to.be.undefined;
            });
        });

        it('should fill multiple slots', () => {
          app = mockApp({
            argument: {
              coverage: 'Kharkiv',
              year: 2017,
            },
          });
          return action.handler(app)
            .then(() => {
              expect(getSlot(app, 'collection')).to.be.undefined;
              expect(getSlot(app, 'creatorId')).to.be.undefined;
              expect(getSlot(app, 'coverage')).to.be.equal('Kharkiv');
              expect(getSlot(app, 'year')).to.be.equal(2017);
            });
        });
      });

      describe('suggestions', () => {
        it('should return list of statis suggestions', () => {
          app = mockApp({
            argument: {},
          });
          return action.handler(app)
            .then(() => {
              expect(dialog.ask).to.have.been.calledOnce;
              expect(dialog.ask.args[0][1])
                .to.have.property('suggestions')
                .to.have.members(['78s', 'Live Concerts']);
            });
        });

        it('should generate suggestions on fly', () => {
          app = mockApp({
            argument: {
              collection: 'live',
              year: 2018,
            },
          });
          return action.handler(app)
            .then(() => {
              expect(provider.args[0][0]).to.have.property('collection', 'live');
              expect(provider.args[0][0]).to.have.property('year', 2018);
              expect(dialog.ask).to.have.been.calledOnce;
              expect(dialog.ask.args[0][1])
                .to.have.property('suggestions')
              // fetch bands for the collection
                .to.have.members(['barcelona', 'london', 'lviv']);
            });
        });

        it('should use suggestion to generate prompt speech', () => {
          app = mockApp({
            argument: {},
          });
          return action.handler(app)
            .then(() => {
              expect(dialog.ask).to.have.been.calledOnce;
              expect(dialog.ask.args[0][1])
                .to.have.property('speech')
                .to.include(
                  'Would you like to listen to music from our collections of 78s or Live Concerts?'
                );
            });
        });

        it('should use one suggestion to generate prompt speech', () => {
          provider = sinon.stub().returns(Promise.resolve({
            items: [
              {coverage: 'Washington, DC', year: 1973},
              {coverage: 'Madison, WI', year: 2000},
              {coverage: 'Worcester, MA', year: 2001},
            ],
          }));
          getSuggestionProviderForSlots = sinon.stub().returns(provider);
          action.__set__('getSuggestionProviderForSlots', getSuggestionProviderForSlots);

          app = mockApp({
            argument: {
              collection: 'live',
              creatorId: 'the band',
            },
          });
          return action.handler(app)
            .then(() => {
              expect(dialog.ask).to.have.been.calledOnce;
              expect(dialog.ask.args[0][1])
                .to.have.property('speech')
                .to.include(
                  'Do you have a specific city and year in mind, like Washington, DC 1973, or would you like me to play something randomly?'
                );
            });
        });
      });
    });
  });
});
