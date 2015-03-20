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

        it('should return null as textual id if there is no opened test', function () {
            // getActiveProjectName
            expect(client.getActiveProjectName()).to.equal(null);
        });

        it('should return the valid textual id of the opened test', function (done) {
            // getActiveProjectName
            client.selectProjectAsync(projectName, function (err) {
                expect(err).to.equal(null);

                expect(client.getActiveProjectName()).to.equal(projectName);
                done();
            });
        });

        it('should return the list of textual ids of available projects', function (done) {
            // getAvailableProjectsAsync
            client.getAvailableProjectsAsync(function (err, names) {
                expect(err).to.equal(null);

                expect(names).to.have.length.least(1);
                expect(names).to.include(projectName);
                done();
            });
        });

        it('should return a filtered list of textual project id, where the user have read access', function (done) {
            // getViewableProjectsAsync
            client.getViewableProjectsAsync(function (err, names) {
                expect(err).to.equal(null);

                expect(names).to.have.length.least(1);
                expect(names).to.include(projectName);
                done();
            });
        });

        it('list of viewable projects should be equal to list of all projects without authentication', function (done) {
            client.getAvailableProjectsAsync(function (err, allNames) {
                expect(err).to.equal(null);

                client.getViewableProjectsAsync(function (err, viewableNames) {
                    expect(err).to.equal(null);

                    expect(viewableNames).to.deep.equal(allNames);
                    done();
                });
            });
        });

        it('should return the authorization info of a given project', function (done) {
            // getProjectAuthInfoAsync
            client.getProjectAuthInfoAsync(projectName, function (err, authInfo) {
                expect(err).to.equal(null);
                expect(authInfo).to.deep.equal({read: true, write: true, delete: true});
                done();
            });
        });

        //FIXME check how it should behave in these scenario - drop error at least under authentication
        it.skip('should return unknown project error for an unknown project', function (done) {
            client.getProjectAuthInfoAsync('unknown_project', function (err) {
                expect(err).not.to.equal(null);
                done();
            });
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

        //FIXME - runs into some undefined is not a function error, but no location
        it.skip('should fail to select an unknown project', function (done) {
            client.selectProjectAsync('unknown_project', function (err) {
                expect(err).to.contain('no such project');
                done();
            });
        });

        //FIXME - mysterious script error (:O)
        it.skip('should create a project with info data', function (done) {
            // createProjectAsync
            var activeProject = client.getActiveProjectName();
            client.createProjectAsync('createProject', {}, function (err) {
                expect(err).to.equal(null);
                expect(client.getActiveProjectName()).to.equal(activeProject);
                done();
            });
        });

        it('should fail to create an already existing project', function (done) {
            client.createProjectAsync(projectName, {}, function (err) {
                expect(err).to.contain('already exists!');
                done();
            });
        });

        //FIXME - mysterious script error (:O)
        it.skip('should delete a project', function (done) {
            // deleteProjectAsync
            var delProjectName = 'deleteProject';
            client.createProjectAsync(delProjectName, {}, function (err) {
                expect(err).to.equal(null);

                client.selectProjectAsync(delProjectName, function (err) {
                    expect(err).to.equal(null);

                    client.deleteProjectAsync(delProjectName, function (err) {
                        expect(err).to.equal(null);

                        client.getAvailableProjectsAsync(function (err, names) {
                            expect(err).to.equal(null);

                            expect(names).not.to.include(delProjectName);

                            done();
                        });
                    });
                });
            });
        });

        it('should be able to delete a nonexistent project', function (done) {
            client.deleteProjectAsync('unknown_project', function (err) {
                expect(err).to.equal(null);

                done();
            });
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

        //FIXME - check if this is the correct behavior
        it('should return the latest n commits', function (done) {
            // getCommitsAsync
            client.selectProjectAsync(projectName, function (err) {
                expect(err).to.equal(null);

                client.getCommitsAsync(client.getActualCommit(), 10, function (err, commits) {
                    expect(err).to.equal(null);

                    console.log(commits);
                    expect(commits).to.have.length.least(1);
                    expect(commits[0]).to.contain.keys('_id', 'root', 'updater', 'time', 'message', 'type');
                    expect(commits[0]['_id']).not.to.equal(client.getActualCommit());
                    done();
                });
            });
        });

        it('should return the actual commit hash', function (done) {
            // getActualCommit
            client.selectProjectAsync(projectName, function (err) {
                expect(err).to.equal(null);

                expect(client.getActualCommit()).to.contain('#');
                expect(client.getActualCommit()).to.have.length(41);
                done();
            });
        });

        it('should return the name of the actual branch', function (done) {
            // getActualBranch
            client.selectProjectAsync(projectName, function (err) {
                expect(err).to.equal(null);

                expect(client.getActualBranch()).to.equal('master');
                done();
            });
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
    describe('meta rule query and setting tests', function () {
        var Client,
            gmeConfig,
            client,
            projectName = 'ProjectAndBranchOperationsTest',
            baseCommitHash;


        before(function (done) {
            this.timeout(10000);
            requirejs(['js/client', 'text!gmeConfig.json'], function (Client_, gmeConfigJSON) {
                Client = Client_;
                gmeConfig = JSON.parse(gmeConfigJSON);
                client = new Client(gmeConfig);

                client.connectToDatabaseAsync({}, function (err) {
                    expect(err).to.equal(null);
                    client.selectProjectAsync('metaQueryAndManipulationTest', function (err) {
                        expect(err).to.equal(null);

                        baseCommitHash = client.getActualCommit();
                        done();
                    });
                });
            });
        });

        it('should return the meta rules of the given node in a json format', function (done) {
            prepareBranchForTest('simpleGet', function (err) {
                expect(err).to.equal(null);

                expect(client.getMeta('/1')).to.deep.equal({
                    'attributes': {
                        'name': {
                            'type': 'string'
                        }
                    },
                    'children': {
                        'minItems': [],
                        'maxItems': [],
                        'items': [],
                        'min': undefined,
                        'max': undefined
                    },
                    'pointers': {},
                    'aspects': {}
                });
                done();
            });

        });

        it('should return the flattened meta rules of a node in json format', function (done) {
            prepareBranchForTest('inheritedGet', function (err) {
                expect(err).to.equal(null);

                expect(client.getMeta('/1865460677')).to.deep.equal({
                    'attributes': {
                        'name': {
                            'type': 'string'
                        }
                    },
                    'children': {
                        'items': [
                            {$ref: '/1687616515'},
                            {$ref: '/1730437907'}
                        ],
                        'minItems': [
                            -1,
                            -1
                        ],
                        'maxItems': [
                            -1,
                            -1
                        ],
                        'min': undefined,
                        'max': undefined
                    },
                    'aspects': {
                        'onlyOne': {
                            'items': [
                                {$ref: '/1730437907'}
                            ]
                        }
                    },
                    'pointers': {}
                });
                done();
            });
        });

        it('should return null if the object is not loaded', function (done) {
            prepareBranchForTest('unknownGet', function (err) {
                expect(err).to.equal(null);

                expect(client.getMeta('/42/42')).to.equal(null);
                done();
            });
        });

        it('modify an empty ruleset to empty', function (done) {
            prepareBranchForTest('noChangeSet', function (err) {
                expect(err).to.equal(null);

                var old = client.getMeta('/1730437907');
                client.setMeta('/1730437907', {});
                expect(client.getMeta('/1730437907')).to.deep.equal(old);
                done();
            });

        });

        it('add some rule via setMeta', function (done) {
            prepareBranchForTest('addWithSet', function (err) {
                expect(err).to.equal(null);

                var old = client.getMeta('/1730437907'),
                    newAttribute = {'type': 'string'};
                client.setMeta('/1730437907', {'attributes': {'newAttr': newAttribute}});
                //we extend our json format as well
                old.attributes.newAttr = newAttribute;
                expect(client.getMeta('/1730437907')).to.deep.equal(old);
                done();
            });
        });

        it('remove some rule via setMeta', function () {
            prepareBranchForTest('removeWithSet', function (err) {
                expect(err).to.equal(null);

                var meta = client.getMeta('/1');

                expect(meta.attributes).to.contain.keys('name');
                delete meta.attributes.name;
                client.setMeta('/1', meta);
                expect(client.getMeta('/1').attributes).not.to.include.keys('name');
                done();

            });
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

        function prepareBranchForTest(branchName, next) {
            //creates a branch then a UI for it, finally waits for the nodes to load
            client.createBranchAsync(branchName, baseCommitHash, function (err) {
                expect(err).to.equal(null);

                client.selectBranchAsync(branchName, function (err) {
                    expect(err).to.equal(null);

                    //now we should load all necessary node, possibly in one step to allow the synchronous execution
                    //we handle only the first incoming set of events to not cause any confusion
                    var alreadyHandled = false;
                    client.updateTerritory(client.addUI({}, function (events) {
                        if (!alreadyHandled) {
                            expect(events).to.have.length(12);
                            expect(events[0]).to.contain.keys('eid', 'etype');
                            expect(events[0].etype).to.equal('complete');

                            alreadyHandled = true;
                            next(null);
                        }
                    }), {'': {children: 1}});
                });
            });
        }
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

    });


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

})
;