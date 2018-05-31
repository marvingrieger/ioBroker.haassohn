/**
 *
 * pallazza adapter
 *
 *
 *  file io-package.json comments:
 *
 *  {
 *      "common": {
 *          "name":         "pallazza",                  // name has to be set and has to be equal to adapters folder name and main file name excluding extension
 *          "version":      "0.0.0",                    // use "Semantic Versioning"! see http://semver.org/
 *          "title":        "Node.js pallazza Adapter",  // Adapter title shown in User Interfaces
 *          "authors":  [                               // Array of authord
 *              "name <mail@pallazza.com>"
 *          ]
 *          "desc":         "pallazza adapter",          // Adapter description shown in User Interfaces. Can be a language object {de:"...",ru:"..."} or a string
 *          "platform":     "Javascript/Node.js",       // possible values "javascript", "javascript/Node.js" - more coming
 *          "mode":         "daemon",                   // possible values "daemon", "schedule", "subscribe"
 *          "materialize":  true,                       // support of admin3
 *          "schedule":     "0 0 * * *"                 // cron-style schedule. Only needed if mode=schedule
 *          "loglevel":     "info"                      // Adapters Log Level
 *      },
 *      "native": {                                     // the native object is available via adapter.config in your adapters code - use it for configuration
 *          "test1": true,
 *          "test2": 42,
 *          "mySelect": "auto"
 *      }
 *  }
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.pallazza.0
var adapter = new utils.Adapter('pallazza');

// Dependencies
var request = require('request');

// Variables
let deviceStates = new Array();
let noOfConnectionErrors = 0;
let missingState = false;
let timer;
let stopAdapter = false;


// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});


// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});


// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    // Warning, state can be null if it was deleted
    adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        adapter.log.info('ack is not set!');
    }
});


// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    if (typeof obj === 'object' && obj.message) {
        if (obj.command === 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});


// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function ()
{
    initialize();
});


function initialize()
{
    // All states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');

    // Start polling
    pollDeviceStatus();
}


// Main function to poll the device status
function pollDeviceStatus()
{
    adapter.log.debug("Polling device");

    // Clear timer
    clearTimeout(timer);

    // Calculate device link
    let link = "http://" + adapter.config.fireplaceAddress + "/status.cgi";

    // Poll device state
    request(link, function (error, response, body)
    {
        if (!error && response.statusCode == 200)
        {
            var result;

            try
            {
                // Evaluate result
                result = JSON.parse(body);

                // Reset error counter
                noOfConnectionErrors = 0;

                // Sync states
                syncState(result, "");
            }
            catch (e)
            {
                // Parser error
                adapter.log.error('Error parsing the response: ' + e);

                // Increment error counter
                noOfConnectionErrors++;
            }
        }
        else {
            // Connection error
            adapter.log.error('Error retrieving status: ' + error);

            // Increment error counter
            noOfConnectionErrors++;
        }

        // Update connection status
        updateConnectionStatus();

        // Poll again
        timer = setTimeout(function(){pollDeviceStatus()}, adapter.config.pollingInterval * 1000);
    });
}


// Indicate the state of the connection by setting the state 'connected'
function updateConnectionStatus()
{
    // Check if there were retries
    if (noOfConnectionErrors > 0)
    {
        adapter.log.error("There was an error getting the device status (counter: " + noOfConnectionErrors + ")");
    }

    // Query current state to check whether something chaged at all
    adapter.getState("connected", function (err, state)
    {
        let connectionSuccessfull =  noOfConnectionErrors == 0 ? true : false;

        // Check whether the state has changed. If so, change state
        if (state == null || state.val != connectionSuccessfull)
        {
            // Update state
            adapter.setState("connected", connectionSuccessfull, true);
        }
    });

    // Query current state to check whether something chaged at all
    adapter.getState("missing_state", function (err, state)
    {
        // Check whether the state has changed. If so, change state
        if (state == null || state.val != missingState)
        {
            // Update state
            adapter.setState("missing_state", missingState, true);
        }
    });

    // Shall we stop the adapter?
    if (stopAdapter)
    {
        adapter.log.error("Adapter shall be stopped ...");
    }
}


// Synchronize the retrieved states with the states of the adapter
function syncState(state, path)
{
    adapter.log.debug("Syncing state (" + state + ") with path (" + path + ") - " + Array.isArray(state));

    try
    {
        // Iterate all elements
        Object.keys(state).forEach(function(key)
        {
            // If value is an object: recurse
            if (typeof state[key] == "object" && !Array.isArray(state[key]))
            {
                let newPath = path == "" ? key  : path + "." + key;
                syncState(state[key], newPath);
            }
            // If value is atomic: process state
            else
            {
                // Calculate stateName
                let stateName = path == "" ? 'device.' + key  : 'device.' + path + "." + key;
                let value = state[key];

                // Store retrieved state in central data structure
                let newState = [];
                newState['value'] = value;
                deviceStates[stateName] = newState;

                // Query current object to check whether the data definition is correct
                adapter.getObject(stateName, function (err, object)
                {
                    if (err)
                    {
                        // Dump error and stop adapter
                        adapter.log.error(err);
                        stopAdapter = true;
                    }

                    // Check that object exists
                    if (object != null)
                    {
                        // Query current state to check whether something changed at all
                        adapter.getState(stateName, function (err, state)
                        {
                            if (err) {
                                // Dump error and stop adapter
                                adapter.log.error(err);
                                stopAdapter = true;
                            }

                            let newState = deviceStates[stateName];
                            deviceStates[stateName] = null;

                            if (state != null)
                            {
                                // Check whether the state has changed. If so, change state
                                if (state.val != newState['value']) {
                                    adapter.log.info("Detected new state for " + stateName + ": " + newState['value'] + " (was: " + state.val + ")");

                                    // Update state
                                    adapter.setState(stateName, newState['value'], true);
                                }

                            }
                            else
                            {
                                adapter.log.info("Detected new state for " + stateName + ": " + newState['value']);

                                // Update state
                                adapter.setState(stateName, newState['value'], true);
                            }
                        });
                    }
                    // Object does not exist, implicates error in data model
                    else
                    {
                        adapter.log.warn("State " + stateName + " does not exist null.");

                        // Indicate that state is missing
                        missingState = true;
                    }
                });
            }
        })
    }
    catch (e)
    {
        // Dump error and stop adapter
        adapter.log.error("Error syncing states: " + e);
        stopAdapter = true;
    }
}