const express = require('express');
const path = require('path');
const fs = require('fs');
const rimraf = require("rimraf");
const { exec } = require('child_process');
const colors = require('colors/safe');
const { queue } = require('./queue');
const { transliterate } = require('transliteration');
const yargs = require('yargs');

async function index(req, res)
{
	//used to quickly debug an existing tmp folder with already aligned lyrics...
	// const debug_tmp_folder = 'gnSRiFzFnPoD8UZA';
	const debug_tmp_folder = false;

	console.log('Received an alignment request!');
	res.setTimeout(10* 3600 * 1000); //10 hours (in case we're stuck waiting in the queue)

	if (!req.files || Object.keys(req.files).length === 0 || !req.files.hasOwnProperty('audio_file')) {
		return res.status(400).send('audio_file is required');
	}

	if (!req.body || Object.keys(req.body).length === 0 || !req.body.hasOwnProperty('lyrics') || !req.body.lyrics) {
		return res.status(400).send('lyrics are required');
	}

	let format = 'json';
	if (req.body.hasOwnProperty('format')) {
		if (!['raw', 'json'].includes(req.body.format))
		return res.status(400).send('If included, format must be "raw" or "json".');
		format = req.body.format;
	}

	//cleanup lyrics...
	console.log('Cleaning lyrics...');
	let lyrics = req.body.lyrics;
	lyrics = lyrics.replace(/^\[.*\][\r\n]/mg, ''); //remove song part identifier lines like [Chorus]
	lyrics = lyrics.replace(/\*[^\n\r]+\*/mg, ' '); //remove things like *breathes*
	lyrics = lyrics.replace(/\([^\n\r\)]+\)/mg, ' '); //remove things like (woo)
	lyrics = lyrics.replace(/\s/mg, ' '); //change all white-space characters to a normal space
	lyrics = lyrics.replace(/\p{Pd}+/mg, ' '); //replace dashes, hyphens, etc with a space
	lyrics = lyrics.replace(/`/mg, '\''); //replace backtick with single quote
	lyrics = lyrics.replace(/&/mg, 'and'); //replace ampersand with "and"
	lyrics = lyrics.replace(/[\r\n]+/mg, ' '); //replace newlines with a space
	lyrics = transliterate(lyrics); //convert all characters to romanized ASCII (including special quote characters)
	lyrics = lyrics.replace(/[^a-zA-Z0-9' ]+/mg, ' '); //remove anything that isn't an alphanumeric character or single quote
	lyrics = lyrics.replace(/ +/mg, ' '); //collapse multiple spaces into one
	lyrics = lyrics.trim(); //trim spaces

	//make sure the lyrics still contain something...
	if (lyrics == '') { throw new Error('The cleaned up lyrics are empty'); }
	if (yargs.argv.debug) { console.log('Cleaned lyrics: ' + lyrics); }

	//ready a new tmp folder...
	console.log('Moving lyrics and audio to a tmp folder...');
	let tmp_folder_name = '';
	let tmp_folder_path = '';
	do {
		tmp_folder_name = random_str();
		tmp_folder_path = path.join(__dirname, 'tmp', tmp_folder_name);
	} while (fs.existsSync(tmp_folder_path));

	//for quick debugging...
	if (debug_tmp_folder)
	{
		tmp_folder_name = debug_tmp_folder;
		tmp_folder_path = path.join(__dirname, 'tmp', tmp_folder_name);
	}

	try
	{
		//attempt to create the new tmp folder...
		await fs.mkdirSync(tmp_folder_path, { recursive: true });

		//save lyrics to tmp file...
		fs.writeFileSync(path.join(tmp_folder_path, 'lyrics.txt'), lyrics);

		//move the audio file to the tmp folder...
		req.files.audio_file.mv(path.join(tmp_folder_path, req.files.audio_file.name));

		//if we're not quickly debugging an existing alignment...
		if (!debug_tmp_folder)
		{
			//add the processing task...
			console.log('Adding alignment task to the queue...');
			const task = queue.add(async () => { return await process(tmp_folder_name, req.files.audio_file.name) });

			//wait for the alignment process to run...
			await task.promise.catch((err) => { throw err; });
		}

		//check that the alignment.txt file exists and is not empty...
		if (!fs.existsSync(path.join(tmp_folder_path, 'aligned.txt'))) throw new Error('Alignment appears to have failed. The aligned.txt file was not created.');
		if (fs.statSync(path.join(tmp_folder_path, 'aligned.txt')).size < 50) throw new Error('Alignment appears to have failed. The aligned.txt file is empty.');
		const aligned_text = fs.readFileSync(path.join(tmp_folder_path, 'aligned.txt'), 'utf8');
		if (aligned_text.length < 10) throw new Error('Alignment appears to have failed. The raw aligned text is empty.');
		if (yargs.argv.debug) console.log('Raw Aligned Lyrics: ' + aligned_text);

		//compile results...
		if (format == 'json')
		{
			console.log("Finished alignment successfully! Compiling to JSON...");
			const results = compile_json(req.body.lyrics, aligned_text);

			//remove tmp folder and return results...
			console.log(colors.green('✔') + ' Done!');
			if (!debug_tmp_folder) rimraf(tmp_folder_path, () => { });
			return res.status(200).json(results);
		}
		else
		{
			console.log("Finished alignment successfully!");

			//remove tmp folder and return raw results...
			console.log(colors.green('✔') + ' Done!');
			if (!debug_tmp_folder) rimraf(tmp_folder_path, () => { });
			return res.status(200).send(aligned_text);
		}
	}
	catch (err)
	{
		rimraf(tmp_folder_path, () => { });
		if (err && err.hasOwnProperty('message')) {
			console.log(colors.red('✖ ' + err.message));
			return res.status(400).send(err.message);
		} else {
			console.log(colors.red('✖ An unexpected error occurred while aligning the lyrics'));
			return res.status(400).send('An unexpected error occurred while aligning the lyrics');
		}
	}
}

function random_str(length = 16)
{
	var result = '';
	var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	var charactersLength = characters.length;
	for (var i = 0; i < length; i++)
	{
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
}

function promisifiedExec(cmd, options = {})
{
	return new Promise((resolve, reject) =>
	{
		if (!options.hasOwnProperty('env')) options.env = process.env;

		const exec_process = exec(cmd, options, (error, stdout, stderr) =>
		{
			if (error)
			{
				reject(error);
			}
			resolve(stdout);
		});

		if (yargs.argv.debug)
		{
			exec_process.stdout.on('data', (data) => { console.log(data.toString()); });
			exec_process.stderr.on('data', (data) => { 'ERROR: ' + console.log(data.toString()); });
		}
	})
}

async function process(tmp_folder_name, audio_file_name)
{
	console.log('Aligning lyrics (this will take awhile)...');

	const cmd = 'singularity shell kaldi.simg -c "./RunAlignment.sh ../tmp/' + tmp_folder_name + '/' + audio_file_name + ' ../tmp/' + tmp_folder_name + '/lyrics.txt ../tmp/' + tmp_folder_name + '/aligned.txt"';

	await promisifiedExec(cmd, { cwd: path.join(__dirname, 'NUSAutoLyrixAlign')});
}

function compile_json(original_lyrics, aligned_text)
{
	const aligned_text_array = aligned_text.trim().split(/\r\n|\r|\n/); //turn aligned text into a more easily accessible array by index
	let aligned_word_count = 0;
	let song_start = null;
	let song_end = null;
	let results = [];
	let compiled_line = [];
	let lines = original_lyrics;
	lines = lines.replace(/`/mg, '\''); //replace backtick with single quote
	lines = lines.split(/\r\n|\r|\n/); //split into array of lines
	lines.forEach(line =>
	{
		compiled_line = [];
		line = line.replace(/\s/mg, ' '); //change all white-space characters to a normal space
		line = line.replace(/ +/mg, ' '); //collapse multiple spaces into one
		line = line.trim();

		//if this is an empty line, skip it...
		if (line == '')
		{
			results.push(compiled_line);
			return;
		}

		//if this is a song part identifier line like [Chorus], skip it...
		if (line.match(/^\[.*\]$/) !== null)
		{
			compiled_line.push({
				word: line,
				processed_words: '',
				start: null,
				end: null,
				ignore: true
			});
			results.push(compiled_line);
			return;
		}

		//split by spaces or things like *breathes* or (woo woo), with the delimiters included in the results...
		let words = line.split(/(\*.+\*|\([^\)\n\r]+\)| )/);
		words.forEach(word =>
		{
			word = word.trim();

			//if the word is empty, skip it completely...
			if (word == '')
			{
				return
			}

			//if this is something like *breathes* or (woo), include it in the results with no timestamp...
			if (word.match(/\*.+\*|\([^\)\n\r]+\)/) !== null)
			{
				compiled_line.push({
					word: word,
					processed_words: '',
					start: null,
					end: null,
					ignore: true
				});
				return;
			}

			//this word could have ended up containing multiple aligned words...
			let start = null;
			let end = null;
			let processed_words = '';
			let ignore = true;
			let aligned_words = word.replace(/\p{Pd}+/g, ' '); //replace dashes, hyphens, etc with a space
			aligned_words = aligned_words.replace(/&/mg, 'and'); //replace ampersand with "and"
			aligned_words = transliterate(aligned_words); //convert all characters to romanized ASCII (including special quote characters). this can also introduce new spaces
			aligned_words = aligned_words.replace(/[^a-zA-Z0-9' ]+/g, ' '); //remove anything that isn't an alphanumeric character or single quote
			aligned_words = aligned_words.replace(/ +/mg, ' '); //collapse multiple spaces into one
			aligned_words = aligned_words.trim(); //punctuation will be turned into spaces, so need to trim that now
			aligned_words = aligned_words.split(' '); //split by spaces
			aligned_words.forEach(aligned_word =>
			{
				aligned_word = aligned_word.trim(); //shouldn't be necessary, but just in case
				if (aligned_word !== '')
				{
					if (aligned_word_count >= aligned_text_array.length)
					{
						if (yargs.argv.debug)
						{
							console.log('Where did we go wrong...');
							console.log(results);
						}

						throw new Error('Could not compile results. We\'ve somehow gone over the raw word count of ' + aligned_text_array.length + ' at word ' + aligned_word);
					}

					let aligned_word_parts = aligned_text_array[aligned_word_count].split(' '); //get the start/end/word from the alignment data
					processed_words = processed_words + aligned_word_parts[2].trim() + ' '; //tack this word onto the end of the compiled word result
					if (start === null) start = parseFloat(aligned_word_parts[0]); //if we haven't gotten the start time yet, this is the first aligned word, and this is the start time
					end = parseFloat(aligned_word_parts[1]); //keep updating the end time, so the last aligned word's end time will be used
					ignore = false;
					aligned_word_count++;
				}
			});

			//keep track of the song's start and end times...
			if (song_start === null && start !== null) song_start = start;
			if (end !== null) song_end = end;

			compiled_line.push({
				word: word,
				processed_words: processed_words.trim(),
				start: start,
				end: end,
				ignore: ignore
			});
		});

		results.push(compiled_line);
	});

	//go back and fill in missing times. start by making sure we have valid start/end song times...
	if (song_start === null) song_start = 0;
	if (song_end === null) song_end = song_start;

	//fill in missing starts by going from start to finish...
	let prev_end = song_start;
	for(let line_x = 0; line_x < results.length; line_x++)
	{
		for(let word_x = 0; word_x < results[line_x].length; word_x++)
		{
			if (results[line_x][word_x].start === null) results[line_x][word_x].start = prev_end;
			if (results[line_x][word_x].end !== null) prev_end = results[line_x][word_x].end;
		}
	}

	//fill in missing ends by going from finish to start...
	let prev_start = song_end;
	for (let line_x = results.length - 1; line_x >= 0; line_x--)
	{
		for (let word_x = results[line_x].length - 1; word_x >= 0; word_x--)
		{
			if (results[line_x][word_x].end === null) results[line_x][word_x].end = prev_start;
			if (results[line_x][word_x].start !== null) prev_start = results[line_x][word_x].start;
		}
	}


	if (aligned_word_count != aligned_text_array.length)
	{
		if (yargs.argv.debug)
		{
			console.log('Where did we go wrong...');
			console.log(results);
		}

		throw new Error('Could not compile results. The aligned word count (' + aligned_word_count + ') does not match the raw word count (' + aligned_text_array.length + ')');
	}

	return results;
}

module.exports.index = index;
