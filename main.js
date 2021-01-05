/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

// Dependencies
var utils = require('@iobroker/adapter-core'); // Get common adapter utils
var md5 = require('md5');
var request = require('request');

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.haassohn.0
var adapter = new utils.Adapter('haassohn');

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback)
{
    try
    {
        adapter.log.info('Adapter is shutting down. Cleaning everything up');

        // Clear timer
        clearTimeout(timer);

        adapter.log.debug('Adapter was shut down. Cleaned everything up.');
        callback();
    } catch (e)
    {
        callback();
    }
});

// Variables
var deviceStates = [];     // Used to internally buffer the retrieved states before writing them to the adapter
var noOfConnectionErrors = 0;       // Counter for connection problems
var missingState = false;           // If a device state cannot be mapped to an internal state of the adapter, this variable gets set
var timer;                          // Settimeout-Pointer to the poll-function
var disableAdapter = false;         // If an error occurs, this variable is set to true which disables the adapter
var hw_version;                     // Hardware version retrieved from the device
var sw_version;                     // Software version retrieved from the device
var hpin;                           // HPIN is the 'encrypted' PIN of the device
var hspin;                          // HSPIN is the secret, depending on the current NONCE and the HPIN
var nonce;                          // The current NONCE of the device


// is called if a subscribed state changes
adapter.on('stateChange', function (id, state)
{
    // Warning, state can be null if it was deleted
    adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack)
    {
        adapter.log.debug('stateChange (command): ' + id + ' ' + JSON.stringify(state));

        if (String(id) === (adapter.namespace + ".device.prg"))
        {
            // Set new program
            var post_data_prg = '{"prg":' + state.val + '}';

            // Perform request
            request.post({
                headers: createHeader(post_data_prg),
                url:     'http://' + adapter.config.fireplaceAddress + '/status.cgi',
                body:    post_data_prg
            }, function(error, response, body)
            {
                adapter.log.debug('POST response: ' + response + ' [RESPONSE]; ' + body + ' [BODY]; ' + error + ' [ERROR];');

                // POST was successful, perform ack
                if (error === null && response.statusCode === 200)
                {
                    // Acknowledge command
                    adapter.setState(adapter.namespace + ".device.prg", state.val, true);
                }
                // POST was not successful, revert
                else
                {
                    adapter.log.error('stateChange (command): ' + id + ' ' + JSON.stringify(state) + ' was not successful');
                    adapter.log.error('POST response: ' + response + ' [RESPONSE]; ' + body + ' [BODY]; ' + error + ' [ERROR];');
                }

                // Poll new state to update nonce immediately
                pollDeviceStatus();
            });
        }
        else if (String(id) === (adapter.namespace + ".device.sp_temp"))
        {
            // Set new program
            var post_data_sp_temp = '{"sp_temp":' + state.val + '}';

            // Perform request
            request.post({
                headers: createHeader(post_data_sp_temp),
                url:     'http://' + adapter.config.fireplaceAddress + '/status.cgi',
                body:    post_data_sp_temp
            }, function(error, response, body)
            {
                adapter.log.debug('POST response: ' + response + ' [RESPONSE]; ' + body + ' [BODY]; ' + error + ' [ERROR];');

                // POST was successful, perform ack
                if (error === null && response.statusCode === 200)
                {
                    // Acknowledge command
                    adapter.setState(adapter.namespace + ".device.sp_temp", state.val, true);
                }
                // POST was not successful, revert
                else
                {
                    adapter.log.error('stateChange (command): ' + id + ' ' + JSON.stringify(state) + ' was not successful');
                    adapter.log.error('POST response: ' + response + ' [RESPONSE]; ' + body + ' [BODY]; ' + error + ' [ERROR];');
                }

                // Poll new state to update nonce immediately
                pollDeviceStatus();
            });
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

    // Calculate HPIN
    hpin = calculateHPIN(adapter.config.pin);

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
    var link = "http://" + adapter.config.fireplaceAddress + "/status.cgi";

    // Poll device state
    request(link, function (error, response, body)
    {
        if (!error && response.statusCode === 200)
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

        // Poll again, except a critical error occurred
        if (!disableAdapter)
        {
            timer = setTimeout(function(){pollDeviceStatus();}, adapter.config.pollingInterval * 1000);
        }
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

    // Query current connection indicator to check whether something changed at all
    adapter.getState("info.connection", function (err, state)
    {
        var connectionSuccessful = noOfConnectionErrors === 0;

        // Check whether the adapter shall be disabled
        if (disableAdapter)
        {
            // Update state
            adapter.setState("info.connection", false, true);
        }
        // Check whether the state has changed. If so, change state
        else if (state === null || state.val !== connectionSuccessful)
        {
            // Update state
            adapter.setState("info.connection", connectionSuccessful, true);
        }
    });

    // Query current missing-state indicator to check whether something changed at all
    adapter.getState("info.missing_state", function (err, state)
    {
        // Check whether the state has changed. If so, change state
        if (state === null || state.val !== missingState)
        {
            // Update state
            adapter.setState("info.missing_state", missingState, true);
        }
    });

    // Check if hardware / software combination is supported
    if (hw_version !== undefined && sw_version !== undefined)
    {
        try
        {
            if (!JSON.parse(adapter.config.supportedHwSwVersions)[hw_version + "_" + sw_version])
            {
                adapter.log.error("Hardware / Software version (" + hw_version + "_" + sw_version + ") is not supported by this adapter!");
                disableAdapter = true;
            }
            else
            {
                adapter.log.debug("Hardware / Software version is supported by this adapter!");
            }

        }
        catch (err)
        {
            // Dump error and stop adapter
            adapter.log.error(err);
            disableAdapter = true;
        }
    }

    // Query current state to check whether something changed at all
    adapter.getState("info.terminated", function (err, state)
    {
        // Check whether the state has changed. If so, change state
        if (state === null || state.val !== disableAdapter)
        {
            // Update state
            adapter.setState("info.terminated", disableAdapter, true);
        }

        // Shall we disable the adapter?
        if (disableAdapter)
        {
            adapter.log.error("Some critical error occurred (see log). Disabling the adapter");
        }
    });


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
            if (typeof state[key] === "object" && !Array.isArray(state[key]))
            {
                var newPath = path === "" ? key  : path + "." + key;
                syncState(state[key], newPath);
            }
            // If value is atomic: process state
            else
            {
                // Calculate stateName
                var stateName = path === "" ? 'device.' + key  : 'device.' + path + "." + key;
                var value = state[key];

                // Store retrieved state in central data structure
                var newState = [];
                newState.value = value;
                deviceStates[stateName] = newState;

                // Query current object to check whether the data definition is correct
                adapter.getObject(stateName, function (err, object)
                {
                    if (err)
                    {
                        // Dump error and stop adapter
                        adapter.log.error(err);
                        disableAdapter = true;
                    }

                    // Check that object exists
                    if (object !== null)
                    {
                        // Query current state to check whether something changed at all
                        adapter.getState(stateName, function (err, state)
                        {
                            if (err) {
                                // Dump error and stop adapter
                                adapter.log.error(err);
                                disableAdapter = true;
                            }

                            var newState = deviceStates[stateName];
                            deviceStates[stateName] = null;

                            // State updates?
                            if (state !== null)
                            {
                                var newValue;

                                // Normalize new value
                                if (typeof newState.value === "object")
                                {
                                    newValue = JSON.stringify(newState.value);
                                }
                                else
                                {
                                    newValue = newState.value;
                                }

                                // Buffer HW-Version for supported version check
                                if (stateName === "device.meta.hw_version" && hw_version !== newValue)
                                {
                                    hw_version = newValue;
                                }
                                // Buffer SW-Version for supported version check
                                else if (stateName === "device.meta.sw_version" && sw_version !== newValue)
                                {
                                    sw_version = newValue;
                                }
                                // Buffer nonce to calculate HSPIN
                                else if (stateName === "device.meta.nonce" && nonce !== newValue)
                                {
                                    nonce = newValue;
                                    hspin = calculateHSPIN(nonce, hpin);
                                }

                                // Check whether the state has changed. If so, change state
                                if (state.val !== newValue)
                                {
                                    adapter.log.debug("Detected new state for " + stateName + ": " + newValue + " (was: " + state.val + ")");

                                    // Update state
                                    adapter.setState(stateName, newValue, true);
                                }

                            }
                            // Initial setting of states
                            else
                            {
                                adapter.log.debug("Detected new state for " + stateName + ": " + newState.value);

                                // Update state
                                if (typeof newState.value === "object")
                                {
                                    adapter.setState(stateName, JSON.stringify(newState.value), true);
                                }
                                else
                                {
                                    adapter.setState(stateName, newState.value, true);
                                }
                            }
                        });
                    }
                    // Object does not exist, implicates error in data model
                    else
                    {
                        adapter.log.warn("State " + stateName + " does not exist. Please contact the developer.");

                        // Indicate that state is missing
                        missingState = true;
                    }
                });
            }
        });
    }
    catch (e)
    {
        // Dump error and stop adapter
        adapter.log.error("Error syncing states: " + e);
        disableAdapter = true;
    }
}


// Given the HPIN and the current NONCE, the HSPIN is calculated
// HSPIN = MD5(NONCE + HPIN)
function calculateHSPIN(NONCE, HPIN)
{
    var result = md5(NONCE + HPIN);
    adapter.log.debug('HSPIN: ' + HPIN);

    return result;
}


// The PIN of the device is used to calculate the HPIN
// HPIN = MD5(PIN)
function calculateHPIN(PIN)
{
    var result = md5(PIN);
    adapter.log.debug('HPIN: ' + result);

    return result;
}


// Provides a header for a POST request
function createHeader(post_data)
{
    return {
        'Host':	adapter.config.fireplaceAddress,
        'Accept':	'*/*',
        'Proxy-Connection':	'keep-alive',
        'X-BACKEND-IP':	'https://app.haassohn.com',
        'Accept-Language': 'de-DE;q=1.0, en-DE;q=0.9',
        'Accept-Encoding': 'gzip;q=1.0, compress;q=0.5',
        'token': '32bytes',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(post_data),
        'User-Agent': 'ios',
        'Connection':	'keep-alive',
        'X-HS-PIN': hspin,
    };
}
