const fs = require('fs');
const path = require('path');
const os = require('os');
const rimraf = require("rimraf");
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
const singularity_md5 = '2edc1a8ac9a4d7d26fba6244f1c5fd95';
const singularity_file_size = 820593;
const singularity_folder_size = 4428694;
const folder_size = 14093891249;
const base_name = 'NUSAutoLyrixAlign';
const file_name = base_name + '.zip';

function copyDirectory(source, destination)
{
	fs.mkdirSync(destination, { recursive: true });

	fs.readdirSync(source, { withFileTypes: true }).forEach((entry) =>
	{
		let sourcePath = path.join(source, entry.name);
		let destinationPath = path.join(destination, entry.name);

		entry.isDirectory()
			? copyDirectory(sourcePath, destinationPath)
			: fs.copyFileSync(sourcePath, destinationPath);
	});
}

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

async function downloadFile(fileUrl, outputLocationPath, fileSize)
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
		total: parseInt(fileSize)
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

async function singularity_install()
{
	let response = await prompts({
		type: 'confirm',
		name: 'value',
		message: 'Would you like to download singularity v2.5.2 now?'
	});

	if (!response.value) {
		throw new Error('singularity is required');
	}

	console.log('Downloading singularity v2.5.2...');
	await downloadFile('https://github.com/singularityware/singularity/releases/download/2.5.2/singularity-2.5.2.tar.gz', path.join(__dirname, 'singularity.tar.gz'), singularity_file_size);

	//make sure the downloaded file exists and looks good...
	if (!fs.existsSync(path.join(__dirname, 'singularity.tar.gz'))) throw new Error('Could not download the singularity tar.gz file for some reason.');
	console.log('Verifying download...');
	if (md5File.sync(path.join(__dirname, 'singularity.tar.gz')) !== singularity_md5) throw new Error('The downloaded file appears to be corrupt.');
	console.log(colors.green('✔') + ' Looks good! Extracting the tar.gz file...');

	//extract the tar.gz file...
	await unzipFile(path.join(__dirname, 'singularity.tar.gz'), path.join(__dirname));
	await unzipFile(path.join(__dirname, 'singularity.tar'), path.join(__dirname));
	rimraf(path.join(__dirname, 'PaxHeaders.672'), () => { }); //remove this leftover as well, if it exists
	const size = await folderSize(path.join(__dirname, 'singularity-2.5.2'));
	if ((Math.round((size / 1024 / 1024 / 1024) * 100) / 100) !== (Math.round((singularity_folder_size / 1024 / 1024 / 1024) * 100) / 100)) throw new Error('The extracted singularity folder is the wrong size.');

	//remove unnecessary tar and tar.gz files...
	console.log(colors.green("\n✔") + ' Extracted folder looks good! Removing the unnecessary tar and tar.gz files...');
	fs.unlinkSync(path.join(__dirname, 'singularity.tar.gz'));
	fs.unlinkSync(path.join(__dirname, 'singularity.tar'));
	console.log(colors.green('✔') + ' Removed!');

	console.log('');
	response = await prompts({
		type: 'confirm',
		name: 'value',
		message: 'Older versions of singularity (like this one) have a bug on newer versions of Linux. We recommended applying a patch to fix this, since there\'s no real downside. Apply the patch?'
	});

	//apply the patch...
	if (response.value) {
		console.log('Applying patch...');

		//patch around line 55, from https://github.com/lyklev/singularity/commit/b386e5005aa83df64a7262658713a92645bf3b24#diff-5d7173fff9b106bda935ccde8a9e3981R55...
		const patch_file = path.join(__dirname, 'singularity-2.5.2', 'src', 'lib', 'image', 'squashfs', 'mount.c');
		let contents = fs.readFileSync(patch_file, {encoding: 'utf8'});
		contents = contents.replace(/^\s*if\s*\(\s*singularity_mount.+[\r|\n]/mg, '\tif ( singularity_mount(loop_dev, mount_point, "squashfs", MS_NOSUID|MS_RDONLY|MS_NODEV, NULL) < 0 ) {' + "\n");
		fs.writeFileSync(patch_file, contents, {encoding: 'utf8'});

		console.log(colors.green('✔') + ' Patched successfully!');
	}

	console.log('');
	console.log(colors.green('✔') + ` Okay! We're going to hand control back to you to finish the installation process. Here's what you'll need to do...

-----------------------------------------
cd singularity-2.5.2
./configure --prefix=/usr/local
make
sudo make install
-----------------------------------------

You might want to copy/paste these commands somewhere for reference.
The most common problem you'll run into is with missing dependencies.
You might need to install gcc, g++, make, and other development tools.
Singularity also has some dependencies you might need to install.
You can likely install all of these using your OS's package manager.
When you're done, feel free to delete the singularity-2.5.2 folder.
`);

	process.exit(0);
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
		message: colors.yellow('⚠ WARNING:') + ' You\'ll need around 16G of disk space free to download and extract the data. About a 13G footprint will remain after installation. Are you sure you want to continue?'
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
					await downloadFile('https://docs.google.com/uc?export=download&confirm=' + matches[1] + '&id=' + file_id, path.join(__dirname, file_name), file_size);
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

async function check_for_patch()
{
	//check to see if the patch has been applied...
	if (md5File.sync(path.join(__dirname, 'patch', base_name, 'RunAlignment.sh')) != md5File.sync(path.join(__dirname, base_name, 'RunAlignment.sh')))
	{
		response = await prompts({
			type: 'confirm',
			name: 'value',
			message: 'Would you like to patch AutoLyrixAlign to allow multiple alignments to run at once? This is recommended, since there\'s no real downside. Apply the patch?'
		});

		if (response.value)
		{
			try
			{
				copyDirectory(path.join(__dirname, 'patch', base_name), path.join(__dirname, base_name))
				if (md5File.sync(path.join(__dirname, 'patch', base_name, 'RunAlignment.sh')) == md5File.sync(path.join(__dirname, base_name, 'RunAlignment.sh')))
					console.log(colors.green('✔') + ' Patch applied successfully!');
				else
					throw Error('We tried to apply the patch, but something seems to have gone wrong.');
			}
			catch(err)
			{
				throw Error('Could not apply the AutoLyrixAlign patch... ' + err.message);
			}
		}
		else
		{
			console.log(colors.yellow('⚠ WARNING:') + ' The patch has NOT been applied. Running concurrent alignments will not work properly. Don\'t use the --concurrency option!');
		}
	}
}

async function check_for_data()
{
	if (!fs.existsSync(path.join(__dirname, base_name))) await missing_data('The ' + base_name + ' folder is missing.');

	const size = await folderSize(path.join(__dirname, base_name));
	if ((Math.round((size / 1024 / 1024 / 1024) * 100) / 100) < (Math.round((folder_size / 1024 / 1024 / 1024) * 100) / 100)) await missing_data('The ' + base_name + ' folder is too small.');

	await check_for_patch();
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
	let singularity_version;
	try {
		singularity_version = check_binary_version('singularity');
	} catch(err) {
		console.log(colors.red('✖ singularity is not installed. We recommend installing v2.5.2.'));
		await singularity_install();
	}

	//singularity IS installed, but is it the right version?
	try {
		check_binary_version('singularity', '2.5.2');

		//the correct version is installed. check to see if the src folder was leftover...
		if (fs.existsSync(path.join(__dirname, 'singularity-2.5.2')))
		{
			const response = await prompts({
				type: 'confirm',
				name: 'value',
				message: 'It looks like the singularity-2.5.2 source code folder is still leftover after installing. It\'s probably no longer needed. Would you like to remove it?'
			});

			if (response.value) {
				rimraf.sync(path.join(__dirname, 'singularity-2.5.2'), {}, (err) => {
					if (err)
					{
						if (err.hasOwnProperty('message'))
							console.log(err.message);
						else
							console.log(err);

						console.log(colors.yellow('⚠') + " Couldn't remove singularity source folder. Continuing anyway...");
					}
				});
			}
		}
	} catch(err) {
		const response = await prompts({
			type: 'confirm',
			name: 'value',
			message: 'singularity v' + singularity_version + ' is installed, but only v2.5.2 has been tested. Continue anyway?'
		});

		if (!response.value) {
			await singularity_install();
		}
	}

	await check_for_data();
}

module.exports.check_dependencies = check_dependencies;
