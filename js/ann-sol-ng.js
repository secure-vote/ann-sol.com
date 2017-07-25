__DEV__ = true;

angular.module('annsol', [])
    .controller('AnnSolController', function ($scope) {
            const annsol = this;
            annsol.annsol = annsol;
            $scope.R = R;

            annsol.showResults = false;
            annsol.domain = "testann.test";
            annsol.fromAddr = '';
            annsol.address = "";
            annsol.web3URL = web3URL;
            annsol.error = "";
            annsol.rawMsgs = [];
            annsol.rawAlerts = [];
            annsol.accounts = [];
            annsol.nMsgsWaiting = [];
            annsol.newAnnString = '';
            annsol.logs = [];
            annsol.owner = '';
            annsol.auditors = [];
            annsol.awaitingTxs = new Set();
            annsol.msgWaitingMap = {};
            annsol.auditNMsgWaiting = -1;
            annsol.lastUpdate = 0;

            annsol.showAnnouncements = false;
            annsol.initDone = false;

            annsol.log = (...args) => {
                annsol.logs.unshift(...(args.reverse()))
            }

            annsol.uiPing = () => {
                try {
                    $scope.$apply()
                } catch (err) {
                }
            }

            annsol.handleError = (err) => {
                annsol.error = err;
                console.warn(err);
                annsol.log(`Error: ${err}`);
                annsol.uiPing();
            }

            annsol.getAddr = (name, cb) => {
                cb(null, getAddr(name));
            }

            annsol.checkEnsDomain = () => {
                annsol.showLoading = true;
                annsol.showResults = false;

                const cb = (err, addr) => {
                    if (err)
                        return annsol.handleError(err)
                    annsol.address = addr;
                    annsol.showResults = true;
                    annsol.showLoading = false;
                    annsol.initDone = true;

                    annsol.genContract();

                    annsol.getAll();
                }

                if (ethutils.isValidAddress(annsol.domain))
                    cb(null, annsol.domain);
                else
                    annsol.getAddr(annsol.domain, cb);
            }

            annsol.getAll = () => {
                annsol.getAnns();
                annsol.getOwner();
                annsol.getAuditors();
                annsol.updateMsgsWaiting();
            }

            annsol.update = () => {
                if (annsol.lastUpdate < Date.now() - 2000) {  // don't update more frequently than 2s
                    annsol.updateMsgsWaiting();
                    annsol.getAnns();
                    annsol.lastUpdate = Date.now();
                }
            }

            annsol.getOwner = () => {
                annsol.contract.owner((err, res) => {
                    if (err)
                        annsol.handleError(err);
                    else {
                        annsol.owner = res;
                    }
                })
            }

            annsol.getAuditors = (n = 0, useFreshList = true) => {
                if (n > 10)
                    return;
                if (useFreshList)
                    annsol.auditors = [];
                annsol.contract.auditorsList(n, (err, res) => {
                    if (res === '0x')
                        return;
                    annsol.auditors.push(res);
                    annsol.getAuditors(n + 1, false);
                })
            }

            annsol.getAnns = () => {
                console.log('getAnns starting');
                annsol.contract.nMsg((err, res) => {
                    if (err) {
                        annsol.handleError(err);
                        return;
                    }
                    console.log('getAnns done');
                    annsol.nMsg = res.c[0];
                    annsol.showAnnouncements = true;
                    $scope.$apply();

                    annsol.getMsgs(annsol.nMsg);
                })
            }

            annsol.updateMsgsWaiting = () => {
                annsol.contract.nMsgsWaiting((err, res) => {
                    if (err) {
                        annsol.handleError(err)
                    } else {
                        annsol.nMsgsWaiting = res.c[0];
                        annsol.msgWaitingMap = {};
                        for (let i = 0; i < annsol.nMsgsWaiting; i++) {
                            annsol.contract.getMsgWaiting(i, (err, res) => {
                                if (err)
                                    return annsol.handleError(err)
                                const [{c: [nAudits]}, {c: [nAlarms]}, msg, {c: [timestamp]}] = res;
                                if (timestamp !== 0) {  // ie it's not done
                                    annsol.msgWaitingMap[i] = {nAudits, nAlarms, msg, timestamp};
                                    console.log(annsol.msgWaitingMap[i])
                                    annsol.uiPing();
                                }
                            })
                        }
                    }
                })
            }

            annsol.getNPending = () => {
                return R.keys(annsol.msgWaitingMap).length;
            }

            annsol.getNAlarms = () => {
                return annsol.rawAlerts.length;
            }

            annsol.getNMsgs = () => {
                return annsol.rawMsgs.length;
            }

            annsol.getMsgs = (n = 0, resetMsgs = true) => {
                if (n <= 0) {
                    $scope.$apply();
                    return;
                }
                if (resetMsgs)
                    annsol.rawMsgs = [];
                annsol.contract.msgMap(n - 1, (err, res) => {
                    if (err)
                        annsol.handleError(err);
                    else {
                        annsol.rawMsgs.push(res);
                        annsol.getMsgs(n - 1, false);
                    }
                })
            }

            annsol.updateWeb3 = () => {
                annsol.log(`Set web3 provider to ${annsol.web3URL}`);
                _web3 = new Web3(new Web3.providers.HttpProvider(annsol.web3URL));
                annsol.genContract();

                _web3.eth.getAccounts((err, res) => {
                    if (err)
                        annsol.handleError(err);
                    else {
                        annsol.accounts = res;
                        console.log('Set accounts:', annsol.accounts)
                        annsol.log(`Updated list of accounts`);

                        if (annsol.accounts.length > 0)
                            annsol.fromAddr = annsol.accounts[0];
                    }
                })
            }

            annsol.setLocalhost = () => {
                annsol.web3URL = "http://localhost:8545/";
                annsol.updateWeb3();
            };

            annsol.genContract = () => {
                annsol.contract = _web3.eth.contract(annSolAbi).at(annsol.address);
                annsol.log(`Creating contract object w/ address ${annsol.address}`);
            };

            annsol.sendNewAnn = () => {
                // todo: confirm and disable button
                annsol.contract.addAnn(annsol.newAnnString, {from: annsol.fromAddr, gas: 120000}, (err, txid) => {
                    if (err) {
                        if (err.toString().contains('todo: some thing about unlocked wallet')) {

                        }
                        annsol.handleError(err);
                    } else {
                        annsol.addTx(txid);
                    }
                    annsol.uiPing();
                })
            };

            annsol.sendAuditGood = () => {
                annsol._sendAudit(true);
            }

            annsol.sendAuditBad = () => {
                annsol._sendAudit(false);
            }

            annsol._sendAudit = (isGood) => {
                annsol.contract.addAudit.estimateGas(annsol.auditNMsgWaiting, isGood, {from: annsol.fromAddr}, (err, gasEstimate) => {
                    console.log(`gasestimate: ${gasEstimate}, ${Math.round(gasEstimate * 1.1)}`)
                    annsol.contract.addAudit(annsol.auditNMsgWaiting, isGood, {
                        from: annsol.fromAddr,
                        gas: Math.round(gasEstimate * 1.1),
                        gasPrice: 40000000000,
                    }, (err, txid) => {
                        if (err)
                            return annsol.handleError(err)
                        annsol.addTx(txid);

                    })
                })
            }

            annsol.addTx = (txid) => {
                annsol.awaitingTxs.add(txid);
                annsol.log(`New Announcement txid: ${txid}`);
                annsol.uiPing();
            }

            annsol.renderAddr = (addr) => {
                return addr + (addr === annsol.owner ? " (Owner)" : "") + (annsol.auditors.includes(addr) ? " (Auditor)" : "");
            }


            if (__DEV__) {  // do this before setting filter
                annsol.setLocalhost();
                annsol.checkEnsDomain();
            }

            _web3.eth.filter('latest', (err, blockHash) => {
                if (err)
                    return annsol.handleError(err);
                if (annsol.initDone) {
                    annsol.update();
                    [...annsol.awaitingTxs].map(txid => _web3.eth.getTransaction(txid, (err, txr) => {
                        console.log(txid, err, txr);
                        if (err)
                            return annsol.handleError(err);
                        if (txr && txr.blockNumber) {
                            annsol.awaitingTxs.delete(txid);
                            annsol.log(`Confirmed ${txid}`);
                            annsol.uiPing();
                        }
                    }))
                }
            });

            // awful hack to update UI after callbacks change state
            // setInterval(() => { try { $scope.$apply() } catch (err) { /*pass*/ } }, 1000);
        }
    )
    .component('expandable', {
        templateUrl: 'expandable.html',
        bindings: {
            title: '@',
            hide: '=',
            titleBgClass: '@',
        },
        restrict : 'EA',
        controller: function($attrs, $scope) {
            if (!$attrs.titleBgClass)
                $attrs.titleBgClass = "bg-blue";
        },
        controllerAs: 'ctrl',
        transclude: true,
        bindToController: true,
    });
