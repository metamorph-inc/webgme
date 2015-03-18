/* jshint browser: true, mocha: true */
/**
 * @author lattmann / https://github.com/lattmann
 */

var WebGMEGlobal = {};

describe('Browser Client', function () {
    'use strict';

    describe('basic object parameter checkings', function () {
        var Client,
            gmeConfig;

        before(function (done) {
            this.timeout(10000);
            requirejs(['js/client', 'text!gmeConfig.json'], function (Client_, gmeConfigJSON) {
                Client = Client_;
                gmeConfig = JSON.parse(gmeConfigJSON);
                done();
            });
        });

        it('should have public API functions', function () {
            //console.log(gmeConfig);
            var client = new Client(gmeConfig);
            expect(client.hasOwnProperty('events')).to.equal(true);
        });

    });

    describe('project and branch operations', function () {
        var Client,
            gmeConfig,
            client,
            projectName = 'ProjectAndBranchOperationsTest';

        before(function (done) {
            this.timeout(10000);
            requirejs(['js/client', 'text!gmeConfig.json'], function (Client_, gmeConfigJSON) {
                Client = Client_;
                gmeConfig = JSON.parse(gmeConfigJSON);
                client = new Client(gmeConfig);

                client.connectToDatabaseAsync({}, function (err) {
                    expect(err).to.equal(null);
                    done();
                });
            });
        });

        it.skip('should close a project', function () {
            // closeOpenedProject

        });

        it.skip('should allow to close project multiple times without error', function () {
            // closeOpenedProject
        });

        it.skip('should create an empty project', function () {
            // createEmptyProject

        });

        it.skip('should return the textual id of the opened project', function () {
            // getActiveProject

        });

        it.skip('should return the list of textual ids of available projects', function () {
            // getAvailableProjectsAsync

        });

        it.skip('should return a filtered list of textual project id, where the user have read access', function () {
            // getViewableProjectsAsync

        });

        it.skip('should return the authorization info of a given project', function () {
            // getProjectAuthInfoAsync

        });

        it('should return the complete project list, with branches and authorization info', function (done) {
            //console.log(gmeConfig);
            client.getFullProjectListAsync(function (err, projects) {
                var key;
                expect(err).to.equal(null);
                for (key in projects) {
                    console.log(key);
                    expect(projects[key].hasOwnProperty('read')).to.equal(true);
                    expect(projects[key].hasOwnProperty('write')).to.equal(true);
                    expect(projects[key].hasOwnProperty('delete')).to.equal(true);
                }
                done();
            });
        });

        it('should selects a given project', function (done) {
            // selectProjectAsync
            client.selectProjectAsync(projectName, function (err) {
                expect(err).to.equal(null);
                done();
            });

        });

        it.skip('should create a project with info data', function () {
            // createProjectAsync

        });

        it.skip('should delete a project', function () {
            // deleteProjectAsync

        });

        it('should list the available branches of the opened project', function (done) {
            // getBranchesAsync
            client.selectProjectAsync(projectName, function (err) {
                expect(err).to.equal(null);

                client.getBranchesAsync(function (err, branches) {
                    expect(err).to.equal(null);

                    expect(branches).to.have.length(1);
                    expect(branches[0]).to.have.keys('name', 'commitId', 'sync');
                    expect(branches[0].name).to.equal('master');
                    done();
                });
            });
        });

        it('should select the given branch of the opened project', function (done) {
            // selectBranchAsync
            client.selectProjectAsync(projectName, function (err) {
                expect(err).to.equal(null);

                client.selectBranchAsync('master', function (err) {
                    expect(err).to.equal(null);
                    done();
                });
            });
        });

        it('should select a nonexistent branch of the opened project', function (done) {
            // selectBranchAsync
            client.selectProjectAsync(projectName, function (err) {
                expect(err).to.equal(null);

                client.selectBranchAsync('does_not_exist', function (err) {
                    expect(err.message).to.equal('there is no such branch!');
                    done();
                });
            });
        });

        it.skip('should return the latest n commits', function () {
            // getCommitsAsync

        });

        it.skip('should return the actual commit hash', function () {
            // getActualCommit

        });

        it.skip('should return the name of the actual branch', function () {
            // getActualBranch

        });

        it.skip('should return the current network state', function () {
            // getActualNetworkStatus
            // connected or disconnected or ?empty?

        });

        it.skip('should return the current branch state', function () {
            // getActualBranchStatus
            // sync or offline or forked

        });

        it.skip('should create a new branch from the given commit', function () {
            // createBranchAsync

        });

        it.skip('should delete the given branch', function () {
            // deleteBranchAsync

        });

        it.skip('should create a new -no change- commit with the given message', function () {
            // commitAsync

        });

        it.skip('should connect to the database', function () {
            // connectToDatabaseAsync

        });
    });


    //TODO how to test as there is no callback
    //no callback start
    it.skip('should copy the list of nodes into the proper container with the proper initial attributes and registry', function () {
        // copyMoreNodes

    });

    it.skip('should copy the given list of nodes in an asyncronous manner', function () {
        // copyMoreNodesAsync

    });

    it.skip('should move the given nodes into the given container', function () {
        // moveMoreNodes

    });

    it.skip('should create children with the given parameters', function () {
        // createChildren

    });

    it.skip('should start a transaction', function () {
        // startTransaction

    });

    it.skip('should complete a transaction and commit the changes', function () {
        // completeTransaction

    });

    it.skip('should modify the attribute of the given node', function () {
        // setAttributes

    });

    it.skip('should delete the given attribute of the node', function () {
        // delAttributes

    });

    it.skip('should sets the given registry entry of the node', function () {
        // setRegistry

    });

    it.skip('should remove the given registry key of the node', function () {
        // delRegistry

    });

    it.skip('should remove the given node', function () {
        // deleteNode

    });

    it.skip('should remove the given list of nodes', function () {
        // delMoreNodes

    });

    it.skip('should create a single child according to the given parameters', function () {
        // createChild

    });

    it.skip('should set the given pointer of the node to the specified target', function () {
        // makePointer

    });

    it.skip('should remove the given pointer of the node', function () {
        // delPointer
    });

    it.skip('should add the given node as a new member to the specified set of our node', function () {
        // addMember

    });

    it.skip('should remove the given member of the specified set of the node', function () {
        // removeMember

    });

    it.skip('should set the given attribute of the specified member of the set', function () {
        // setMemberAttribute

    });

    it.skip('should remove the specific attribute of the set member', function () {
        // delMemberAttribute

    });

    it.skip('should set the given registry key of the set member', function () {
        // setMemberRegistry

    });

    it.skip('should remove the specified registry key of the set member', function () {
        // delMemberRegistry

    });

    it.skip('should create an empty set for the node with the given name', function () {
        // createSet

    });

    it.skip('should remove the given set of the node', function () {
        // deleteSet

    });

    it.skip('should change the ancestor of the given node', function () {
        // setBase

    });

    it.skip('should remove the ancestor of the given node', function () {
        // delBase
        // TODO should we remove this from the 'public' API

    });

    it.skip('should add the constraint under the given name to the node data', function () {
        // setConstraint

    });

    it.skip('should remove the constraint from the node data', function () {
        // delConstraint

    });
    //no callback end
    //TODO how to test as there is no callback

    it.skip('should register the User Interface object', function () {
        // addUI

    });

    it.skip('should remove the User Interface object', function () {
        // removeUI

    });

    it.skip('should change the territory of the given User Interface object', function () {
        // updateTerritory

    });

    it.skip('should return a node object from the given path of the project to allow certain queries', function () {
        // getNode

    });

    it.skip('should export the list of nodes in a REST-API format', function () {
        // exportItems

    });

    it.skip('should return a url which would download the given list of nodes', function () {
        // getExportItemsUrlAsync

    });

    it.skip('should return a url where a context object can be downloaded', function () {
        // getExternalInterpreterConfigUrlAsync

    });

    it.skip('should return a url where the given library (sub-tree) is available', function () {
        // getExportLibraryUrlAsync

    });

    it.skip('should update the given library (sub-tree) with the specified import json', function () {
        // updateLibraryAsync

    });

    it.skip('should import the given library (sub-tree) from the specified json', function () {
        // addLibraryAsync

    });

    it.skip('should return a json format of the node (or a sub-tree)', function () {
        // dumpNodeAsync

    });

    it.skip('should import a node (or a whole sub-tree) into the given container from the specified json', function () {
        // importNodeAsync

    });

    it.skip(' should merge the given node (or sub-tree) and the specified json', function () {
        // mergeNodeAsync

    });

    it.skip(' should create a project from the given json', function () {
        // createProjectFromFileAsync

    });

    it.skip('should return a url for dumping the whole project', function () {
        // getDumpURL

    });

    it.skip('should give back the project object (which can be used to create core objects)', function () {
        // getProjectObject

    });

    it.skip('should return the list of available plugin names', function () {
        // getAvailableInterpreterNames

    });

    it.skip('should execute the given plugin on the server and return its result', function () {
        // runServerPlugin

    });

    it.skip('should return a list of available decorators', function () {
        // getAvailableDecoratorNames

    });

    it.skip('should return a list of projects extended with the \'in collection\' meta data', function () {
        // getFullProjectsInfoAsync

    });

    it.skip('should set the \'in collection\' meta data of a project', function () {
        // setProjectInfoAsync

    });

    it.skip('should return the \'in collection\' meta data of a project', function () {
        // getProjectInfoAsync

    });

    it.skip('should return a list of used tags in the \'in collection\' meta data', function () {
        // getAllInfoTagsAsync
    });

    it.skip('should create a new branch for the given project (not necessarily the opened)', function () {
        // createGenericBranchAsync

    });

    it.skip('should delete a branch form the given project (not necessarily the opened one)', function () {
        // deleteGenericBranchAsync

    });

    it.skip('should return the commit hash of the closest common ancestor of the given commit hashes', function () {
        // getBaseOfCommits
        // not used yet

    });

    it.skip('should return a json tree with the differences of the given two root hashes', function () {
        // getDiffTree
        //not used yet

    });

    it.skip('should generate a conflict object from the given two diff objects', function () {
        // getConflictOfDiffs
        // not used yet
    });

    it.skip('should apply the modifications defined by the json object on the given root', function () {
        // applyDiff
        //not used yet
    });

    it.skip('should start the merge of the given two commit hashes and return a conflict object', function () {
        // merge
        // not used yet

    });

    it.skip('should resolve the given conflict object and apply the patch', function () {
        // resolve
        //not yet used and seems duplicated

    });

    //TODO add only proxied functions
    it.skip('should return the meta rules of the given node in a json format', function () {
        // getMeta

    });

    it.skip('should set the meta rules of the given node, according the specified json object', function () {

    });

    it.skip('should return the \'children\' portion of the meta rules of the node', function () {
        // getChildrenMeta

    });

    it.skip('should set the \'children\' portion of the meta rules of the node according the given json', function () {
        // setChildrenMeta

    });

    it.skip('should return a specific parameter of the children rules', function () {
        // getChildrenMetaAttributes
        //not used - like global min and max

    });
    it.skip('should set a specific parameter of the children rules', function () {
        // setChildrenMetaAttribute
        // not used

    });

    it.skip('should return the directory of valid child types of the node', function () {
        // getValidChildrenItems

    });
    //    updateValidChildrenItem: META.updateValidChildrenItem,
    //    removeValidChildrenItem: META.removeValidChildrenItem,
    //    getAttributeSchema: META.getAttributeSchema,
    //    setAttributeSchema: META.setAttributeSchema,
    //    removeAttributeSchema: META.removeAttributeSchema,
    //    getPointerMeta: META.getPointerMeta,
    //    setPointerMeta: META.setPointerMeta,
    //    getValidTargetItems: META.getValidTargetItems,
    //    updateValidTargetItem: META.updateValidTargetItem,
    //    removeValidTargetItem: META.removeValidTargetItem,
    //    deleteMetaPointer: META.deleteMetaPointer,
    //    getOwnValidChildrenTypes: META.getOwnValidChildrenTypes,
    //    getOwnValidTargetTypes: META.getOwnValidTargetTypes,
    //    isValidChild: META.isValidChild,
    //    isValidTarget: META.isValidTarget,
    //    isValidAttribute: META.isValidAttribute,
    //    getValidChildrenTypes: META.getValidChildrenTypes,
    //    getValidTargetTypes: META.getValidTargetTypes,
    //    hasOwnMetaRules: META.hasOwnMetaRules,
    //    filterValidTarget: META.filterValidTarget,
    //    isTypeOf: META.isTypeOf,
    //    getValidAttributeNames: META.getValidAttributeNames,
    //    getOwnValidAttributeNames: META.getOwnValidAttributeNames,
    //    getMetaAspectNames: META.getMetaAspectNames,
    //    getOwnMetaAspectNames: META.getOwnMetaAspectNames,
    //    getMetaAspect: META.getMetaAspect,
    //    setMetaAspect: META.setMetaAspect,
    //    deleteMetaAspect: META.deleteMetaAspect,
    //    getAspectTerritoryPattern: META.getAspectTerritoryPattern,


    //TODO add also client/node API tests
    //getParentId: getParentId,
    //    getId: getId,
    //    getGuid: getGuid,
    //    getChildrenIds: getChildrenIds,
    //    getBaseId: getBaseId,
    //    getInheritorIds: getInheritorIds,
    //    getAttribute: getAttribute,
    //    getEditableAttribute: getEditableAttribute,
    //    getRegistry: getRegistry,
    //    getEditableRegistry: getEditableRegistry,
    //    getOwnAttribute: getOwnAttribute,
    //    getOwnEditableAttribute: getOwnEditableAttribute,
    //    getOwnRegistry: getOwnRegistry,
    //    getOwnEditableRegistry: getOwnEditableRegistry,
    //    getPointer: getPointer,
    //    getPointerNames: getPointerNames,
    //    getAttributeNames: getAttributeNames,
    //    getRegistryNames: getRegistryNames,
    //    getOwnAttributeNames: getOwnAttributeNames,
    //    getOwnRegistryNames: getOwnRegistryNames,
    //    getOwnPointer: getOwnPointer,
    //    getOwnPointerNames: getOwnPointerNames,
    //
    //    //SetFunctions
    //    getMemberIds: getMemberIds,
    //    getSetNames: getSetNames,
    //    getMemberAttributeNames: getMemberAttributeNames,
    //    getMemberAttribute: getMemberAttribute,
    //    getEditableMemberAttribute: getEditableMemberAttribute,
    //    getMemberRegistryNames: getMemberRegistryNames,
    //    getMemberRegistry: getMemberRegistry,
    //    getEditableMemberRegistry: getEditableMemberRegistry,
    //
    //    //META functions
    //    getValidChildrenTypes: getValidChildrenTypes,
    //
    //    //constraint functions
    //    getConstraintNames: getConstraintNames,
    //    getOwnConstraintNames: getOwnConstraintNames,
    //    getConstraint: getConstraint,
    //
    //    printData: printData,
    //    toString: toString,
    //
    //    getCollectionPaths: getCollectionPaths

});