__DEV__ = false;

angular.module('annsol', [])
    .controller('AnnSolController', function ($scope, $location) {
            const annsol = this;
            annsol.annsol = annsol;
            $scope.R = R;

            annsol.showResults = false;
            annsol.domain = "ann-sol.eth";
            annsol.fromAddr = '';
            annsol.web3URL = web3URL;
            annsol.ipfsURL = R.clone(ipfsURL);
            annsol.error = "";
            annsol.accounts = [];
            annsol.logs = [];
            annsol.awaitingTxs = new Set();
            annsol.testnet = false;
            annsol.gasPrice = 4000000000;
            annsol.lastUpdate = 0;
            annsol.gasMultiply = 1.5;  // testnet RPC seems to require more than 1.1, unsure why.


            annsol.searchObj = $location.search();


            annsol.resetState = () => {
                annsol.address = "";
                annsol.rawMsgs = [];
                annsol.renderedMsgs = {};
                annsol.renderedMsgsDone = {};
                annsol.rawAlerts = [];
                annsol.nMsgsWaiting = [];
                annsol.newAnnString = '';
                annsol.owner = '';
                annsol.auditors = [];
                annsol.msgWaitingMap = {};
                annsol.msgAlarmsMap = {};
                annsol.auditNMsgWaiting = -1;
            }
            annsol.resetState();

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

            annsol.handleError = (loc) => (err) => {
                console.warn(`Error at ${loc}`)
                annsol.error = err;
                annsol.log(`Error: ${err}`);
                console.error(err);
                annsol.uiPing();
            }

            annsol.swapTestnet = () => {
                if (annsol.testnet) {
                    annsol.setMainnetWeb3();
                    annsol.testnet = false;
                } else {
                    annsol.setTestnetWeb3();
                    annsol.testnet = true;
                }
            }

            annsol.getAddr = (name, cb) => {
                if (annsol.testnet)
                    getAddrTestnet(name, cb);
                else
                    getAddr(name, cb);
            }

            annsol.checkEnsDomain = () => {
                annsol.showLoading = true;
                annsol.showResults = false;
                annsol.resetState();

                const cb = (err, addr) => {
                    if (err)
                        return annsol.handleError('checkEnsDomain')(err)
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
                annsol.getOwner();
                annsol.getAuditors();
                annsol.update();
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
                        annsol.handleError('getOwner')(err);
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
                        annsol.handleError('getAnns')(err);
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
                        annsol.handleError('updateMsgsWaiting.nMsgsWaiting')(err)
                    } else {
                        annsol.nMsgsWaiting = res.c[0];
                        annsol.msgAlarmsMap = {};
                        annsol.msgWaitingMap = {};
                        for (let i = 0; i < annsol.nMsgsWaiting; i++) {
                            annsol.contract.getMsgWaiting(i, (err, res) => {
                                if (err)
                                    return annsol.handleError('updateMsgsWaiting.getMsgWaiting')(err)
                                const [{c: [nAudits]}, {c: [nAlarms]}, msg, {c: [timestamp]}, alarmed] = res;
                                if (timestamp === 0) {  // means this doc has been deleted from msgsWaiting
                                    return;
                                }
                                const msgDoc = {nAudits, nAlarms, msg, timestamp};
                                if (alarmed) {
                                    annsol.msgAlarmsMap[i] = msgDoc;
                                } else {
                                    annsol.msgWaitingMap[i] = msgDoc;
                                }
                                annsol.uiPing();
                            })
                        }
                    }
                })
            }

            annsol.getNPending = () => {
                return R.keys(annsol.msgWaitingMap).length;
            }

            annsol.getPendingMsgs = () => annsol.getSortedListOfElementsFrom(annsol.msgWaitingMap);
            annsol.getAlarmedMsgs = () => annsol.getSortedListOfElementsFrom(annsol.msgAlarmsMap);

            annsol.getSortedListOfElementsFrom = (dict) => {
                const keys = R.sort((a, b) => b - a, R.map(i => parseInt(i), R.keys(dict)));
                return R.map(k => dict[k], keys);
            }

            annsol.getNAlarms = () => {
                return R.keys(annsol.msgAlarmsMap).length;
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
                        annsol.handleError('getMsgs')(err);
                    else {
                        annsol.rawMsgs.push(res);
                        annsol.genRenderedMsg(n, res);
                        annsol.getMsgs(n - 1, false);
                    }
                })
            }

            annsol.genRenderedMsg = (n, [mhOrString, ts]) => {
                if (annsol.renderedMsgsDone[n])
                    return;
                annsol.addRenderedMsg(n, mhOrString, ts, false);
                ipfsClient.files.cat(mhOrString)
                    .then(stream => {
                        const chunks = [];
                        stream.on('data', chunk => chunks.push(chunk));
                        stream.on('end', () => {
                            console.log(chunks);
                            const renderedMsg = R.reduce((acc, c) => acc + c, '', R.map(c => c.toString(), chunks));
                            annsol.addRenderedMsg(n, renderedMsg, ts, true, mhOrString);
                            annsol.uiPing();
                        });
                        stream.on('error', err => {
                            log.warning("Error in IPFS stream", err);
                        });
                    })
                    .catch(err => {
                        const es = err.toString();
                        console.log(es);
                        if (!es.includes('multihash') && !es.includes('base58'))
                            console.log(err);
                        annsol.addRenderedMsg(n, mhOrString, ts, false);
                        annsol.uiPing();
                    })
            }

            annsol.addRenderedMsg = (n, msg, ts, isIpfs, rawMsg = null) => {
                if (rawMsg === null)
                    rawMsg = msg;
                annsol.renderedMsgs[n] = {msg, ts, isIpfs, rawMsg};
                annsol.renderedMsgsDone[n] = true;
            }

            annsol.getRenderedMsgs = () => {
                const keys = R.map(i => parseInt(i), R.keys(annsol.renderedMsgs));
                keys.sort();
                return R.map(k => annsol.renderedMsgs[k], R.reverse(keys));
            }

            annsol.updateWeb3 = () => {
                annsol.log(`Set web3 provider to ${annsol.web3URL}`);
                _web3 = new Web3(new Web3.providers.HttpProvider(annsol.web3URL));
                annsol.genContract();
                setEnsTestnet();
                setEnsMainnet();

                _web3.eth.getAccounts((err, res) => {
                    if (err)
                        annsol.handleError('updateWeb3')(err);
                    else {
                        annsol.accounts = res;
                        console.log('Set accounts:', annsol.accounts)
                        annsol.log(`Updated list of accounts`);

                        if (annsol.accounts.length > 0)
                            annsol.fromAddr = annsol.accounts[0];

                        annsol.uiPing()
                    }
                })
            }

            annsol.updateIpfs = () => {
                ipfsClient = ipfsApi(annsol.ipfsURL);
            }

            annsol.setLocalhost = () => {
                annsol.setLocalhostIpfs();
                annsol.setLocalhostWeb3();
            };

            annsol.setLocalhostWeb3 = () => {
                annsol.web3URL = "http://localhost:8545/";
                annsol.updateWeb3();
            }

            annsol.setTestnetWeb3 = () => {
                annsol.web3URL = web3TestnetURL;
                annsol.updateWeb3();
            }

            annsol.setMainnetWeb3 = () => {
                annsol.web3URL = web3MainnetURL;
                annsol.updateWeb3();
            }

            annsol.setLocalhostIpfs = () => {
                annsol.ipfsURL = {host: 'localhost', port: '5001', protocol: 'http'};
                annsol.updateIpfs();
            }

            annsol.genContract = () => {
                annsol.contract = _web3.eth.contract(annSolAbi).at(annsol.address);
                annsol.log(`Creating contract object w/ address ${annsol.address}`);
            };

            annsol.sendNewAnn = () => {
                // todo: confirm and disable button
                annsol.contract.addAnn.estimateGas(annsol.newAnnString, {from: annsol.fromAddr}, (err, gasEstimate) => {
                    console.log('estimate:', gasEstimate, '- sending:', gasEstimate * annsol.gasMultiply);
                    const continueAnn = confirm(`Warning: about to issue new announcement from ${annsol.fromAddr} with gasEstimate: ${gasEstimate}.\n\nContent: ${annsol.newAnnString}\n\nDo you want to continue?`);
                    if (!continueAnn)
                        return;
                    annsol.contract.addAnn(annsol.newAnnString, {
                        from: annsol.fromAddr,
                        gas: Math.round(gasEstimate * annsol.gasMultiply),
                        gasPrice: annsol.gasPrice,
                    }, (err, txid) => {
                        if (err) {
                            if (err.toString().includes('todo: some thing about unlocked wallet')) {

                            }
                            annsol.handleError('sendNewAnn')(err);
                        } else {
                            annsol.addTx(txid);
                        }
                        annsol.uiPing();
                    })
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
                    console.log(`gasestimate: ${gasEstimate}, ${Math.round(gasEstimate * annsol.gasMultiply)}`);
                    const continueAudit = confirm(`Warning: about to audit result (message okay: ${isGood}) from ${annsol.fromAddr} with gasEstimate: ${gasEstimate}.\n\nDo you want to continue?`);
                    if (!continueAudit)
                        return;
                    annsol.contract.addAudit(annsol.auditNMsgWaiting, isGood, {
                        from: annsol.fromAddr,
                        gas: Math.round(gasEstimate * annsol.gasMultiply),
                        gasPrice: annsol.gasPrice,
                    }, (err, txid) => {
                        if (err)
                            return annsol.handleError('_sendAudit')(err)
                        annsol.addTx(txid);

                    })
                })
            }

            annsol.addTx = (txid) => {
                annsol.awaitingTxs.add(txid);
                annsol.log(`New txid: ${txid}`);
                annsol.uiPing();
            }

            annsol.renderAddr = (addr) => {
                return addr + (addr === annsol.owner ? " (Owner)" : "") + (annsol.auditors.includes(addr) ? " (Auditor)" : "");
            }

            annsol.renderTs = (ts) => {
                return moment.unix(ts).format()
            }

            annsol.calcHeaderHeight = (addABit = false) => {
                let hh = document.getElementById("header").getBoundingClientRect().height;
                if (addABit)
                    hh = Math.round(hh * 1.0999);

                console.log(hh)
                return hh;
            }

            annsol.isOwner = (addr) => addr === annsol.owner;
            annsol.isAuditor = addr => annsol.auditors.includes(addr);


            if (__DEV__) {  // do this before setting filter
                annsol.setLocalhost();
                annsol.checkEnsDomain();
                annsol.gasPrice = 40000000000;
            }

            // init code
            console.log(annsol.searchObj);
            if (annsol.searchObj.domain) {
                annsol.domain = annsol.searchObj.domain;
                annsol.checkEnsDomain();
                annsol.showDomainSetter = !annsol.showDomainSetter;
            }


            setInterval(() => {
                if (annsol.initDone) {
                    _web3.eth.getBlock('latest', (err, block) => {
                        if (err)
                            return annsol.handleError('getBlock')(err)
                        if (block && annsol.lastBlock !== block.hash) {
                            annsol.lastBlock = block.hash;
                            annsol.update();
                        }
                        console.log(block);
                    });
                    [...annsol.awaitingTxs].map(txid => _web3.eth.getTransaction(txid, (err, txr) => {
                        console.log(txid, err, txr);
                        if (err)
                            return annsol.handleError('getTransaction')(err);
                        if (txr && txr.blockNumber) {
                            annsol.awaitingTxs.delete(txid);
                            annsol.log(`Confirmed ${txid}`);
                            annsol.update();
                            annsol.uiPing();
                        }
                    }))
                }
            }, 10 * 1000);  // check every 10s

            // awful hack to update UI after callbacks change state
            // setInterval(() => { try { $scope.$apply() } catch (err) { /*pass*/ } }, 1000);
        }
    )
    .component('expandable', {
        templateUrl: 'expandable.html',
        bindings: {
            title: '@',
            hide: '=',
            small: '=',
            titleBgClass: '@',
        },
        restrict: 'EA',
        controller: function ($attrs, $scope) {
            if (!$attrs.titleBgClass)
                $attrs.titleBgClass = "bg-blue";
            if (!$attrs.small)
                $attrs.small = false;

            this.titleC = () => {
                if (this.small)
                    return ['h4', 'm0'];
                return [];
            }

            this.titleBoxC = () => {
                if (this.small)
                    return ['p1', this.titleBgClass];
                return ['p2', this.titleBgClass]
            }

            this.buttonC = () => {
                if (this.small)
                    return ['h6', 'p1', 'm0'];
                return [];
            }
        },
        controllerAs: 'ctrl',
        transclude: true,
        bindToController: true,
    });
