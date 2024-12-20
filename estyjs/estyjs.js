/*

This file is part of EstyJS.

EstyJS is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software
Foundation, either version 2 of the License, or (at your option) any later
version.

EstyJS is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
EstyJS. If not, see <https://www.gnu.org/licenses/>. 

Get in touch: https://github.com/kaiec/EstyJS

Original author (2013-2024): Darren Coles
Current maintainer (since 2024): Kai Eckert
*/


// main block for EstyJs
// written by Darren Coles
"use strict";

function EstyJs(output) {

	//var d = new Date();
	//var startTime = d.getTime();
	//var lastFrame = startTime;
	var frameCount = 0;
	var lastFrame = window.performance.now();

	var nextFrame = 0;

	var running = true;

	var soundInit = false;

	var soundEnabled = false;

	var requestAnimationFrame = (
		//window.requestAnimationFrame || window.msRequestAnimationFrame ||
		//window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame ||
		//window.oRequestAnimationFrame ||
		function (callback) {
			setTimeout(function () {
				callback();
			}, 20);
		}
	);

	var self = {};

	var firstFrame = true;

	var bug = EstyJs.bug({
	});

	var fileManager = EstyJs.fileManager({
	});


	var mfp = EstyJs.mfp({
		bug: bug
	});

	var keyboard = EstyJs.Keyboard({
		mfp: mfp,
		control: output
	});

	var fdc = EstyJs.fdc({
		bug: bug,
		fileManager: fileManager,
		mfp: mfp
	});

	var sound = EstyJs.Sound({
		fdc: fdc,
		bug: bug
	});

	var io = EstyJs.io({
		sound: sound,
		bug: bug,
		mfp: mfp,
		fdc: fdc,
		keyboard: keyboard
	});

	var memory = EstyJs.Memory({
		io: io,
		fileManager: fileManager,
		bug: bug
	});


	var processor = EstyJs.Processor({
		memory: memory,
		mfp: mfp,
		bug: bug
	});

	var display = EstyJs.Display({
		memory: memory,
		io: io,
		fdc: fdc,
		processor: processor,
		output: output
	});

	var snapshot = EstyJs.SnapshotFile({
		memory: memory,
		io: io,
		display: display,
		keyboard: keyboard,
		mfp: mfp,
		processor: processor,
		fileManager: fileManager
	});

	mfp.setDisplay(display);
	keyboard.setDisplay(display);
	fdc.setMemory(memory);
	io.setDisplay(display);
	processor.setup();
	sound.setProcessor(processor);
	memory.setProcessor(processor);

	nextFrame = window.performance.now() + 20;
	//setInterval(runframe, 20);
	setTimeout(runframe, 20);

	function runframe() {
		if (running & memory.loaded == 1) {
			if (firstFrame) {
				self.reset();
				firstFrame = false;
			}

			var currTime = window.performance.now();

			//var reqFrames = (currTime - startTime)/20;		
			//while (frameCount< reqFrames)
			{
				display.startFrame();
				sound.startFrame();
				processor.vblInterrupt();
				keyboard.checkJoystick();
				while (display.beamRow < 313) {
					display.startRow();
					mfp.startRow();
					processor.hblInterrupt();
					processor.runCode();
					display.processRow();
					fdc.processRow();
					sound.processRow();
					//fix: knightmare - HACK! delay keyboard processing
					if (!(display.beamRow & 3)) keyboard.processRow();
					mfp.endRow();
				}
				sound.endFrame(soundEnabled);
				frameCount++;
			}
		}
		display.setFrameRate(2000 / (currTime - lastFrame));

		lastFrame = currTime;

		//nextFrame = nextFrame+20;
		setTimeout(runframe, Math.max(0, 20 - (~~(window.performance.now() - lastFrame + 1))));
		//setTimeout(runframe,nextFrame-window.performance.now())
	}

	self.reset = function () {
		memory.reset();
		display.reset();
		sound.reset();
		processor.reset(0);

	};

	self.pauseResume = function () {
		running = !running;
		return running;
	}

	self.soundToggle = function () {
		soundEnabled = !soundEnabled;
		if (soundEnabled && !soundInit) {
			sound.init();
			soundInit = true;
		}
		return soundEnabled;
	}

	self.changeTOS = function (file) {
		memory.changeTOS(file);
		this.reset()
	}

	self.openSnapshotFile = function (file) {
		snapshot.loadSnapshot(file);
	}

	self.openFloppyFile = function (drive, file) {
		fdc.loadFile(drive, file);
	}

	self.openZipFile = function (drive, file) {
		function zipCallback(files) {
			for (var i = 0; i < files.length; i++) {
				var fname = files[i];
				var ext = fname.substr(fname.lastIndexOf('.')).toLowerCase();
				if (ext == '.sts') {
					snapshot.loadSnapshot(file);
					break;
				}
				if (ext == '.st') {
					fdc.loadFile(drive, file);
					break;
				}
			}
		}

		fileManager.getZipFilenames(file, zipCallback);
	}

	self.setJoystick = function (joyEnabled) {
		keyboard.KeypadJoystick = joyEnabled;
	}

	self.setShowPct = function (ShowPctEnabled) {
		display.setShowSpeedPct(ShowPctEnabled);
	}

	self.setFrameskip = function (frameSkipEnabled) {
		display.setFrameskip(frameSkipEnabled);
	}

	self.setMonoMonitor = function (monoMonitor) {
		mfp.setMonoMonitor(monoMonitor);
	}

	self.getMonoMonitor = function () {
		return mfp.getMonoMonitor();
	}

	self.setMemory = function (mem1mb) {
		if (mem1mb) {
			memory.setMemSize(1024);
			io.setRamBanks(2);
		} else {
			memory.setMemSize(512);
			io.setRamBanks(1);
		}
		this.reset();
	}

	self.lockMouse = function () {
		keyboard.lockMouse();
	}

	self.getMouseLocked = function () {
		return keyboard.mouseLocked();
	}

	self.setRowSkip = function (val) {
		display.setRowSkip(val);
	}

	return self;
}