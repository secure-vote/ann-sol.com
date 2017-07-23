angular.module('annsol', [])
    .controller('AnnSolController', function($scope) {
        const annsol = this;

        annsol.showResults = false;
        annsol.domain = "testann.test";
        annsol.address = "";

        annsol.showAnnouncements = false;

        annsol.checkEnsDomain = () => {
            annsol.address = getAddr(annsol.domain);
            annsol.showResults = true;

            annsol.contract = web3.eth.contract(annSolAbi).at(annsol.address);

            annsol.getAnns();
        }

        annsol.getAnns = () => {
            console.log('getAnns starting')
            annsol.contract.nMsg((err, res) => {
                if (err) {
                    console.warn(err);
                    return;
                }
                console.log('getAnns done')
                annsol.nMsg = res.c[0];
                annsol.showAnnouncements = true;
                $scope.$apply()
            })
        }
    });
