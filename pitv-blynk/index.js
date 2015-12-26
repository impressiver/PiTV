#!/usr/bin/env node

var yargs = require('yargs'),
  Blynk = require('blynk-library');

const ARGV = yargs
  .usage('Usage: $0 <auth> [options]')
  .help('h')
  .demand(1, 'Blynk auth token required')
  .alias('k', 'auth')
  .alias('v', 'verbose')
  .alias('h', 'help')
  .count('verbose')
  .version(function() {
    return require('../package').version;
  })
  .argv;

const VERBOSE_LEVEL = ARGV.verbose;
const AUTH_TOKEN = ARGV._[0] || ARGV.auth;
const PINS = {};

// Logging
function LOG(level, objs) {
  var prefix = '' + new Date().toISOString() + ' [' + level + ']:',
    args = Array.prototype.slice.call(objs, 0);
  
  args.unshift(prefix);
  console.log.apply(console, args);
}

function ERROR() { LOG('ERROR', arguments); }
function WARN()  { VERBOSE_LEVEL >= 0 && LOG('WARN', arguments); }
function INFO()  { VERBOSE_LEVEL >= 1 && LOG('INFO', arguments); }
function DEBUG() { VERBOSE_LEVEL >= 2 && LOG('DEBUG', arguments); }


// Check flags

if (!AUTH_TOKEN) {
  ERROR('Empty auth token');
  yargs.showHelp();
  exit(1);
}


// Start Blynk
var syncOnConnect = true,
  pulseInterval;

var blynk = new Blynk.Blynk(AUTH_TOKEN);


// Digital pins

// Virtual pins
PINS.blynk = new blynk.VirtualPin(1);
PINS.mqtt  = new blynk.VirtualPin(2);
PINS.aws   = new blynk.VirtualPin(3);

PINS.sync  = new blynk.VirtualPin(60);
PINS.beep  = new blynk.VirtualPin(63);
PINS.pulse = new blynk.VirtualPin(64);


// Pulse
function pulse(on) {
  if (!on) {
    if (!!pulseInterval) {
      DEBUG('Stopping pulse');
      clearInterval(pulseInterval);
      pulseInterval = null;
    }
    return;
  }
  
  var flip = false,
    toggle = function() {
      flip = !flip;
      PINS.pulse.write(flip ? 255 : 0);
    };

  DEBUG('Starting pulse');
  toggle();
  pulseInterval = setInterval(toggle, 5000);
}

// Write current virtual pin values to refresh UI
// (iOS does not yet support 'read' handlers)
function sync() {
  INFO('Syncing app state');

  // Sync virtual pins
  PINS.blynk.write(255);

  // Restart pulse
  pulse(false);
  pulse(true);
}


// Pin event handlers

PINS.sync.on('write', function(param) {
  var int = parseInt(param);
  DEBUG('sync.write', int);

  return !!int ? sync() : false;
});

PINS.beep.on('write', function(param) {
  var int = parseInt(param, 10);
  DEBUG('beep.write', int);

  if (!int) return;
  INFO('Beep');
});

PINS.blynk.on('read', function() {
  DEBUG('blynk.read');
  PINS.blynk.write(255);
});


// Blynk event handlers

blynk.on('connect', function() {
  INFO('Blynk connected');

  // Sync after connect
  if (syncOnConnect) {
    // Delay to prevent race conditions
    setTimeout(sync, 100);
    syncOnConnect = false;
    return;
  }
  
  // Otherwise just start the pulse
  pulse(true);
});

blynk.on('disconnect', function() {
  INFO('Blynk disconnected');
 
  // Flatline
  pulse(false);
});
