# AutoLyrixAlign Service
### Accurate word-level alignment of lyrics to polyphonic audio

This is a service API wrapper around [chitralekha18/AutoLyrixAlign](https://github.com/chitralekha18/AutoLyrixAlign). It also includes dependency checks and mostly automates the setup process. It basically makes the whole thing super easy-to-use!

All the real work is done by the system developed at [chitralekha18/AutoLyrixAlign](https://github.com/chitralekha18/AutoLyrixAlign), though. Amazing work going on over there that's honestly over my head. I just wanted to use it as a foolproof API service.

## Requirements
* **Linux**. On Windows, you can probably use WSL2 (though I haven't tested that). I'm not sure about MacOS. If you're not on Linux, look into installing [singularity](https://www.sylabs.io) on your OS. Maybe try [this](https://www.opengeosys.org/docs/devguide/advanced/singularity)?
* **NodeJS**. I've only tested on **v16**, but I imagine you can probably go as low as **v10**.
* **Singularity**. If it's not installed, you'll get instructions on how to install it when you run the server. It's used to run the containerized software from [chitralekha18/AutoLyrixAlign](https://github.com/chitralekha18/AutoLyrixAlign) in a reproducible way. Only singularity **v2.5.2** has been tested.
* **RAM**. [chitralekha18/AutoLyrixAlign](https://github.com/chitralekha18/AutoLyrixAlign) recommends having 20GB of RAM. I've found that it uses closer to 13GB. Your mileage may vary!
* **Disk Space**. You'll need about 30GB free to automatically download and extract the necessary data files. After the initial setup, about a 13GB footprint will remain used. If you only have closer to 13GB free, you could try downloading and extracting the data file on another computer and copying the 13GB over directly.

## Installation
* Clone this repository. `git clone git@github.com:gazugafan/AutoLyrixAlignService.git`
* Go into the project folder you just cloned. `cd AutoLyrixAlignService`
* Run the server. `node index.js`

**We'll check for the required dependencies when you run the server. If you're missing `singularity`, we'll help you install it. We'll also help download the necessary 13GB of data.*

## Usage
With the server running, you should be able to open `localhost:3000` in your browser (adjust the port and domain for however you set things up). This will bring you to a simple page where you can test out the API. Select a file, enter lyrics, and submit the form. You should see some simple logs output in the server console, and after a few minutes you should get the results back in the browser!

To use the service programatically, just send a POST request to `/align` the same way the form does. Be sure to set the `Content-Type` header to `multipart/form-data`. The POST parameters are...
* `audio_file` The polyphonic audio file to align with. Can be MP3, WAV, etc.
* `lyrics` The lyrics to align. Can include any sort of newline characters you like, special characters, song part identification lines (like [Chorus]), backup lines (like (woo) or \*breathes\*), etc. Anything you throw at it should work.
* `format` What format you'd like the results returned in. Can be set to `raw` or `json` (defaults to `json`). `raw` gives you the results directly from the alignment process. `json` massages those results into an array of lines and words that should match back up to the original lyrics supplied.

You can also get the current version with a GET request to `/version`.

## Server Options
You can specify the following command-line options at the end of `node index.js`...
```
Options:
      --version                Show version number                     [boolean]
  -p, --port                   The port to listen on             [default: 3000]
  -d, --skip-dependency-check  Skips dependency checks (lowers startup time)
                                                                       [boolean]
  -c, --concurrency            The max number of alignment processes to run at
                               the same time                        [default: 1]
      --debug                  Outputs more info, including the alignment
                               command output                          [boolean]
  -h, --help                   Show help                               [boolean]
```
