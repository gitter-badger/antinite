'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); /*
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      * Layer for services
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      */

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _groups_levels = require('./groups_levels');

var _groups_levels2 = _interopRequireDefault(_groups_levels);

var _worker = require('./worker');

var _worker2 = _interopRequireDefault(_worker);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Layer = function () {
  function Layer(layerName, _ref) {
    var globalLookUp = _ref.globalLookUp;
    var pendingRestarter = _ref.pendingRestarter;
    var messagerBus = _ref.messagerBus;
    var reportsState = _ref.reportsState;

    _classCallCheck(this, Layer);

    this.name = layerName;
    this.globalLookUp = globalLookUp; // global look up ref
    this.pendingRestarter = pendingRestarter; // pending look up ref
    this.messagerBus = messagerBus;
    this.reportsState = reportsState;
    this.registeredWorkers = {};
    this.grantedTickets = new WeakSet(); // storage for granted tickets to services at resolving stage
    this.localLookUp = this.localLookUp.bind(this);
  }

  _createClass(Layer, [{
    key: 'getName',
    value: function getName() {
      return this.name;
    }

    /*
     * Add some services to layer
     */

  }, {
    key: 'addWorkers',
    value: function addWorkers(workersList) {
      if (!Array.isArray(workersList)) {
        throw TypeError('Workers list must be an Array, halt!');
      }
      workersList.forEach(this.addWorker, this
      // first service may have last one as require - just retry
      );this.repeatResolving();
      this.pendingRestarter
      // for log sys
      ();if (this.reportsState.isDebuggEnabled) {
        this.messagerBus('debugger', { message: 'layer ' + this.name + ' add workers done!' });
      }
      return this;
    }

    /*
     * Restart dependencies
     */

  }, {
    key: 'repeatResolving',
    value: function repeatResolving() {
      var _this = this;

      var worker = void 0;

      Object.keys(this.registeredWorkers).forEach(function (workerName) {
        worker = _this.registeredWorkers[workerName];
        if (!worker.isReady()) {
          worker.doResolvePending();
        }
      }, this);
    }

    /*
     * Add one service to layer
     */

  }, {
    key: 'addWorker',
    value: function addWorker(workerDesc) {
      var currentWorker = void 0,
          workerName = void 0;

      if (!(Reflect.has(workerDesc, 'name') && Reflect.has(workerDesc, 'service') && Reflect.has(workerDesc, 'acl'))) {
        throw TypeError('Wrong worker description, halt!');
      }
      currentWorker = new _worker2.default(workerDesc);
      currentWorker.setLookUp(this.localLookUp.bind(this));
      currentWorker.setMessagerBus(this.messagerBus);
      currentWorker.setReportsState(this.reportsState);
      workerName = currentWorker.getName();
      this.registeredWorkers[workerName] = currentWorker;
      currentWorker.prepareModule({ layerName: this.getName() });
    }
  }, {
    key: 'localLookUp',
    value: function localLookUp(callerName, serviceName, action) {
      var res = void 0,
          callerLayer = this.getName();

      res = this.serviceLookup(callerLayer, callerName, _groups_levels2.default.group, serviceName, action);
      if (!res) {
        res = this.globalLookUp(callerLayer, callerName, serviceName, action);
      }
      return res;
    }
  }, {
    key: 'isServiceRegistered',
    value: function isServiceRegistered(serviceName) {
      return !!this.registeredWorkers[serviceName];
    }

    /*
     * Local look up (at layer)
     */

  }, {
    key: 'serviceLookup',
    value: function serviceLookup(callerLayer, callerName, callerGroup, serviceName, action) {
      var message = void 0,
          ticket = { callerGroup: callerGroup, callerName: callerName, callerLayer: callerLayer },
          service = this.registeredWorkers[serviceName];

      if (service) {
        message = 'for ' + callerLayer + '.' + callerName + ' (group |' + callerGroup + '|) to ' + this.getName() + '.' + serviceName + '.' + action + ' (mask ' + service.getAcl() + ', type |' + service.getExportFnType(action) + '|)';
        if (service.isActionGranted(callerGroup, action)) {
          // for log sys
          if (this.reportsState.isDebuggEnabled) {
            this.messagerBus('debugger', { message: 'access granted ' + message });
          }
          this.grantedTickets.add(ticket
          // return ticket AND layer in duty to ASAP execution
          );return { ticket: ticket, layer: this };
        } else {
          // for log sys
          if (this.reportsState.isDebuggEnabled) {
            this.messagerBus('debugger', { message: 'access denied ' + message });
          }
          console.warn('-  (x) Access denied ' + message);
        }
      }
    }

    /*
     * Execute action, if caller has valid ticket
     */

  }, {
    key: 'executeAction',
    value: function executeAction(ticket, serviceName, action) {
      var service = this.registeredWorkers[serviceName];

      if (!this.grantedTickets.has(ticket)) {
        throw Error('ticket not valid, access denied!');
      }
      if (service) {
        if (!service.isReady()) {
          throw Error('service ' + service.getName() + ' not ready, its on ' + service.getStatus() + ' stage!');
        }
        // for audit sys, only if it enabled to reduce load

        for (var _len = arguments.length, args = Array(_len > 3 ? _len - 3 : 0), _key = 3; _key < _len; _key++) {
          args[_key - 3] = arguments[_key];
        }

        if (this.reportsState.isAuditEnabled) {
          this.messagerBus('auditor', this.getAuditMessage(ticket, serviceName, action, service, args));
        }
        return service.doExecute.apply(service, [action].concat(args));
      }
    }

    /*
     * Prepare audit message
     */

  }, {
    key: 'getAuditMessage',
    value: function getAuditMessage(ticket, serviceName, action, service, args) {
      return {
        message: ticket.callerLayer + '.' + ticket.callerName + ' (group |' + ticket.callerGroup + '|) call ' + this.getName() + '.' + serviceName + '.' + action + ' (mask ' + service.getAcl() + ', type |' + service.getExportFnType(action) + '|)',
        type: 'execute',
        caller: {
          layer: ticket.callerLayer,
          name: ticket.callerName,
          group: ticket.callerGroup
        },
        target: {
          layer: this.getName(),
          name: serviceName,
          action: action,
          mask: service.getAcl(),
          type: service.getExportFnType(action)
        },
        args: args
      };
    }

    /*
     * Report about whole layer ready
     */

  }, {
    key: 'isReady',
    value: function isReady() {
      var _this2 = this;

      return Object.keys(this.registeredWorkers).every(function (workerName) {
        return _this2.registeredWorkers[workerName].isReady();
      }, this);
    }
  }]);

  return Layer;
}();

exports.default = Layer;