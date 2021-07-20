const fs = require('fs');
const path = require('path');
const os = require('os');
const sevenBin = require('7zip-bin');
const { extractFull } = require('node-7z');
const colors = require('colors/safe');
const semver = require('semver');
const prompts = require('prompts');
const { execSync } = require('child_process');
const ProgressBar = require('progress');
const axios = require('axios');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const md5File = require('md5-file');
const getSize = require('get-folder-size');

axiosCookieJarSupport(axios);
const cookieJar = new tough.CookieJar();

const file_id = '1zJdhPr9SzTVRXIaiZ7eF_QKN0PT2sbIW';
const file_size = 3926853316;
const file_md5 = '653d797b5dc7855bd3bd008a6d577b97';
const folder_size = 14093891249;
const base_name = 'NUSAutoLyrixAlign';
const file_name = base_name + '.zip';

async function folderSize(folder)
{
	return new Promise((resolve, reject) => {
		getSize(folder, (err, size) => {
			if (err) {
				reject(err);
			}
			else {
				resolve(size);
			}
		});
	});
}

async function downloadFile(fileUrl, outputLocationPath)
{
	const writer = fs.createWriteStream(outputLocationPath);

	const response = await axios({
		url: fileUrl,
		method: 'GET',
		responseType: 'stream',
		jar: cookieJar,
		withCredentials: true
	});

	const progressBar = new ProgressBar('Downloading... [:bar] :percent | ETA: :etas', {
		width: 40,
		complete: '=',
		head: '>',
		incomplete: ' ',
		renderThrottle: 1000,
		total: parseInt(file_size)
	});

	response.data.on('data', (chunk) => progressBar.tick(chunk.length));
	response.data.pipe(writer);

	return new Promise((resolve, reject) => {
		writer.on('finish', resolve);
		writer.on('error', reject);
	});
}

async function unzipFile(file, output)
{
	const reader = extractFull(file, output, {
		$bin: sevenBin.path7za,
		$progress: true
	});

	const progressBar = new ProgressBar('Extracting... [:bar] :percent | ETA: :etas', {
		width: 40,
		complete: '=',
		head: '>',
		incomplete: ' ',
		renderThrottle: 1000,
		total: 100
	});

	reader.on('progress', function (progress) {
		progressBar.update(progress.percent / 100);
	});

	return new Promise((resolve, reject) => {
		reader.on('end', resolve);
		reader.on('error', reject);
	});
}

function find_version(str) {
	const matches = str.match(/\d+(\.\d+){2,}/) || [];
	if (matches.length > 0)
		return matches[0];

	return false;
}

function check_binary_version(binary, desired_version = false, options = ' --version')
{
	try {
		result = execSync(binary + ' ' + options, {stdio: 'pipe'});
	} catch(err) {
		throw new Error(binary + ' doesn\'t seem to be installed correctly. Make sure it\'s installed and available in your PATH. We got this error: ' + err.toString());
	}

	if (desired_version === 'any')
	{
		console.log(colors.green('?') + ' ' + binary + ' is installed!');
		return true;
	}

	const version = find_version(result.toString().substr(0, 100));
	if (version === false || semver.valid(version) === null)
		throw new Error('Couldn\'t determine the version of ' + binary + '. Maybe it\'s not installed correctly? Make sure it\'s installed and available in your PATH. We got this result: ' + result.toString());

	if (desired_version) {
		if (!semver.satisfies(version, desired_version))
			throw new Error(binary + ' ' + version + ' is installed, but we require ' + desired_version);

		console.log(colors.green('?') + ' ' + binary + ' ' + version + ' is installed!');
	}

	return version;
}

function singularity_install_instructions()
{
	return `
-----------------------------------------
wget https://github.com/singularityware/singularity/releases/download/2.5.2/singularity-2.5.2.tar.gz
tar xvf singularity-2.5.2.tar.gz
cd singularity-2.5.2
./configure --prefix=/usr/local
make
sudo make install
-----------------------------------------`;
}

async function missing_data(msg)
{
	console.log(colors.red('✖ ' + msg));
	console.log('');
	let response = await prompts({
		type: 'confirm',
		name: 'value',
		message: 'Would you like to automatically download and install the ' + base_name + ' data?'
	});

	if (!response.value) {
		throw new Error('See https://github.com/chitralekha18/AutoLyrixAlign for more info. Unzip the downloaded data into the ' + base_name + ' folder.');
	}

	console.log('');
	response = await prompts({
		type: 'confirm',
		name: 'value',
		message: colors.yellow('⚠ WARNING:') + ' You\'ll need around 30G of disk space free to download and extract the data. About a 13G footprint will remain after installation. Are you sure you want to continue?'
	});

	if (!response.value) {
		throw new Error('See https://github.com/chitralekha18/AutoLyrixAlign for more info. Unzip the downloaded data into the ' + base_name + ' folder.');
	}

	//download zip file if it doesn't already exist...
	console.log('');
	if (!fs.existsSync(path.join(__dirname, file_name)))
	{
		console.log('Downloading data from Google Drive. This is a 3.7G file and may take some time...');

		try {
			const response = await axios.get('https://docs.google.com/uc?export=download&id=' + file_id, {
				jar: cookieJar,
				withCredentials: true
			});

			if (response.status === 200)
			{
				let matches = response.data.match(/confirm=([0-9A-Za-z_]+)/);
				if (matches.length > 1)
				{
					await downloadFile('https://docs.google.com/uc?export=download&confirm=' + matches[1] + '&id=' + file_id, path.join(__dirname, file_name));
				}
				else
					throw new Error('Could not find confirmation code.');
			}
			else
				throw new Error('Response was not OK.');
		} catch (err) {
			throw new Error('Could not download file from Google Drive. ' + err.message);
		}
	}
	else
		console.log('ZIP file already exists. Going to try to use it as-is...');

	//check that the zip file is correct...
	if (!fs.existsSync(path.join(__dirname, file_name))) throw new Error('Could not download the file from Google Drive for some reason.');
	console.log('Verifying download...');
	if (md5File.sync(path.join(__dirname, file_name)) !== file_md5) throw new Error('The downloaded file appears to be corrupt.');
	console.log(colors.green('✔') + ' Looks good!');

	//unzip...
	console.log('Extracting 13G of data. This may take awhile...');
	await unzipFile(path.join(__dirname, file_name), path.join(__dirname));

	//check that folder has expected data now...
	await check_for_data();

	//delete ZIP file...
	console.log(colors.green('✔') + ' The data looks good! Removing the unnecessary ZIP file...');
	fs.unlinkSync(path.join(__dirname, file_name));
}

async function check_for_data()
{
	if (!fs.existsSync(path.join(__dirname, base_name))) await missing_data('The ' + base_name + ' folder is missing.');

	const size = await folderSize(path.join(__dirname, base_name));
	if ((Math.round((size / 1024 / 1024 / 1024) * 100) / 100) !== (Math.round((folder_size / 1024 / 1024 / 1024) * 100) / 100)) await missing_data('The ' + base_name + ' folder is the wrong size.');
}

async function check_dependencies(skip = false)
{
	if (skip)
		return;

	console.log('Checking dependencies...');

	//check for linux...
	if (os.platform() === 'win32') throw new Error('This will only work on Linux. Windows users can try using WSL2.');
	else if (os.platform() === 'darwin') throw new Error('This will only work on Linux. MacOS users can try using VirtualBox.');
	else if (os.platform() !== 'linux') throw new Error('This will only work on Linux.');

	//check that singularity is even installed...
	try {
		check_binary_version('singularity');
	} catch(err) {
		throw new Error(`singularity is not installed

We recommend installing v2.5.2
Here's how to install it...` + singularity_install_instructions())
	}

	//singularity IS installed, but is it the right version?
	let singularity_version;
	try {
		singularity_version = check_binary_version('singularity', '2.5.2');
	} catch(err) {
		const response = await prompts({
			type: 'confirm',
			name: 'value',
			message: 'singularity v' + singularity_version + ' is installed, but only v2.5.2 has been tested. Continue anyway?'
		});

		if (!response.value) {
			throw new Error('You can install singularity v2.5.2 like this...' + singularity_install_instructions());
		}
	}

	await check_for_data();
}

module.exports.check_dependencies = check_dependencies;
