# ioBroker.pallazza
This adapter enables to control a Haas+Sohn - HSP 6 PALLAZZA-III 534.08 device in ioBroker.

## Features
* All states of the device are read regularly (by polling) and represented in ioBroker
* The polling interval, the IP address of the device as well as the device PIN can be configured
* The adapter contains a predefined data model of the states of the device (defined in *io-package.json*). If the adapter senses that the data model is missing some states, the state of the adapter *missing_states* is set to true. This situation might occur, as the data model is not fully known (since the source code of the device is not available). The predefined data model was learned by observing the device
* The adapter gets disabled, if an error occurs (i.e., if the hardware / software version is not supported). In this case, the adapter is shut down internally (no further polling of the device). This is implied by the state *terminated* which then changes to *true*.
* The device can be controlled: it can be turned on and off (*prg*) and the desired temperature (*sp_temp*) can be set

## Changelog
### 0.2.0
* The device can now be controlled. Currently, turning the device on and off (*prg) and setting the desired temperature (*sp_temp*) is supported.

### 0.1.0
* First functional release. States of the device are read and represented in ioBroker. However, the device cannot be controled yet (e.g., setting the temperature).

### 0.0.1
* Initial release. The adapter is not functional yet.

## License
The MIT License (MIT)

Copyright (c) 2018 Marvin Grieger <mail@marvingrieger.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
