from pydub import AudioSegment
import scipy.signal
import scipy.io.wavfile
import numpy as np
import re
import os
import sys

def CleanUpLyrics(lyrics_raw):
    line = lyrics_raw.lower()
    # stripped_line = re.sub('[^0-9a-zA-Z ]+', '', line)
    regex = re.compile('[,\.!?"\n]')
    stripped_line = regex.sub('', line)
    if stripped_line == '': return
    check_for_bracket_words = stripped_line.split(' ')
    non_bracket_words = []

    for elem in check_for_bracket_words:
        if elem == "": continue #remove extra space
        #if elem == "breath*":
        #    elem = 'sil'
        if '(' in elem or ')' in elem: continue
        if elem[-1] == '\'': elem = elem.replace('\'','g') #Check if "'" is at the end of a word, then replace it with "g", eg. makin' => making
        if elem=="'cause": elem="cause"
        elem=elem.replace('-',' ')
        non_bracket_words.append(elem)
    stripped_line = ' '.join(non_bracket_words)
    return stripped_line.upper()

def M4AtoWAV16k(M4Afile,WAVfile):
    fs = 16000
    #print M4Afile
    m4a_version = AudioSegment.from_file(M4Afile)
    m4a_version.export(WAVfile, format="wav")
    fs_raw,raw_wav_data = scipy.io.wavfile.read(WAVfile)
    if raw_wav_data.ndim>1: #convert stereo to mono
        raw_wav_data = raw_wav_data.astype(float)
        raw_wav_data = raw_wav_data.sum(axis=1)/2
    n = raw_wav_data.shape[0]
    y = np.floor(np.log2(n))
    nextpow2 = np.power(2, y + 1)
    raw_wav_data2 = np.pad(raw_wav_data, ((0, int(nextpow2 - n))), mode='constant')
    # t = time.time()
    resampled_signal = scipy.signal.resample(raw_wav_data2/32768.0,int(fs*len(raw_wav_data2)*1.0/fs_raw))

    padded_zero_duration = (len(resampled_signal)*1.0/fs) - (len(raw_wav_data)*1.0/fs_raw)

    resampled_signal = np.delete(resampled_signal,range(len(resampled_signal)-int(padded_zero_duration*fs),len(resampled_signal)))
    # print time.time()-t
    if max(resampled_signal)>=1.0:
        resampled_signal = resampled_signal*0.9
        resampled_signal = resampled_signal/max(np.abs(resampled_signal))
    resampled_signal = np.array(resampled_signal*32768.0, dtype=np.int16)
    scipy.io.wavfile.write(WAVfile,fs,resampled_signal)

def GetLyrics(lyricsfile):
    fin = open(lyricsfile,'r')
    flines = fin.readlines()
    all_lines = []
    for line in flines:
        line = line.lower()
        # stripped_line = re.sub('[^0-9a-zA-Z ]+', '', line)
        regex = re.compile('[,\.!?"\n]')
        stripped_line = regex.sub('', line)
        if stripped_line == '': continue
        check_for_bracket_words = stripped_line.split(' ')
        non_bracket_words = []

        for elem in check_for_bracket_words:
            if elem == "": continue #remove extra space
            #if elem == "breath*": continue
            if '(' in elem or ')' in elem: continue
            if elem[-1] == '\'': elem = elem.replace('\'','g') #Check if "'" is at the end of a word, then replace it with "g", eg. makin' => making
            if elem=="'cause": elem="cause" #the ASR detects "'cause" as "cuz"
            if elem == "'head": elem = "head"  # the ASR detects "'cause" as "cuz"
            if elem[0]=="'": elem=elem[1:]
            elem=elem.replace('-',' ')
            elem = elem.replace('_', "'")
            non_bracket_words.append(elem)
        stripped_line = ' '.join(non_bracket_words)
        all_lines.append(stripped_line)
    all_lines =  ' '.join(all_lines)
    # print all_lines
    return all_lines.upper()

if __name__ == '__main__':

    tmpfolder = sys.argv[3]
    songfile = sys.argv[1]#'../mirex_other_songs/UmbrellaRihanna.wav'#'../mirex_other_songs/viva_la_vida.wav' #
    songname = os.path.splitext(songfile.split(os.sep)[-1])[0]
    mp3file = songfile#"/Users/chitralekha/Documents/Research/kaldi/egs/MirexMusicLyricsAlignment/mirex_other_songs/"+songfile

    if not os.path.exists('wavfiles'):
        os.mkdir('wavfiles')
    wavfile = 'wavfiles'+os.sep+songname+".wav" #"/Users/chitralekha/Documents/Research/kaldi/egs/MirexMusicLyricsAlignment/wavfiles/"+songname+".wav"

    lyricssource = sys.argv[2]#os.path.splitext(songfile)[0]+'.txt' #'../mirex_other_songs/rolling_in_the_deep.txt' #'/Users/chitralekha/Documents/Research/kaldi/egs/MirexMusicLyricsAlignment/mirex_other_songs/'+songname+'.txt'

    print "######## File format Conversion ########"
    M4AtoWAV16k(mp3file, wavfile)

    print "####### Lyrics Preparation #######"
    lyrics = GetLyrics(lyricssource)
    # print lyrics

    print "####### Prepare files for alignment #######"
    if not os.path.exists('data'):
        os.mkdir('data')
    if not os.path.exists('data'+os.sep+tmpfolder):
        os.mkdir('data'+os.sep+tmpfolder)

    ##############################
    # Make text
    fout = open('data/' + tmpfolder + '/text', 'w')
    fout.write(songname+' '+lyrics+'\n')

    ##############################
    # Make wavscp
    fout = open('data/' + tmpfolder + '/wav.scp', 'w')
    fout.write(songname.replace('.wav','') + ' ' + wavfile + '\n')
    fout.close()

    ##############################
    # Make utt2spk
    fout = open('data/' + tmpfolder + '/utt2spk', 'w')
    fout.write(songname+' '+songname+'\n')
    fout.close()

    ##############################
    # Make spk2utt
    fout = open('data/' + tmpfolder+ '/spk2utt', 'w')
    fout.write(songname + ' ' + songname + '\n')
    fout.close()

    ##############################
    # Remove old cmvn and feats files
    if os.path.exists('data/' + tmpfolder + '/cmvn.scp'):
        os.remove('data/' + tmpfolder + '/cmvn.scp')
    if os.path.exists('data/' + tmpfolder + '/feats.scp'):
        os.remove('data/' + tmpfolder + '/feats.scp')






