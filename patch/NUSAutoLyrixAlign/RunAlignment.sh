#!/bin/bash
#Text and song mp3/wav is given
#Convert .mp3 to .wav (if the song is in .mp3 format)
#Process text to generate spk2utt, text, utt2spk
#Generate wav.scp
#Write original music file in same format
#Pass it to  the Lyrics alignment module

# eg.: RunAlignment.sh /home/chitra/ForChitra/Mirex2019/Abba.KnowingMeKnowingYou.wav /home/chitra/ForChitra/Mirex2019/Abba.KnowingMeKnowingYou.wordonset.txt Abba.KnowingMeKnowingYou_aligned.txt
TMP_FOLDER=$(tr -dc A-Za-z0-9 </dev/urandom | head -c 13 ; echo '')
echo "#### Your inputs are: #####"
echo "Input audio file is: $1 ....."
echo "Input lyrics file is: $2 ....."
echo "Output alignment file is: $3 ....."
echo "Temporary folder is: $TMP_FOLDER ....."

echo "####### PRE-PROCESSING #######"
python PreProcessing.py $1 $2 $TMP_FOLDER
dos2unix data/$TMP_FOLDER/text

echo "####### ALIGNING ######"
./run_align.sh $TMP_FOLDER
python ConvertCTMtoFiles.py $TMP_FOLDER
mv AlignedLyricsOutput/$TMP_FOLDER/alignedoutput.txt $3

echo "####### CLEANING UP ######"
rm -Rf AlignedLyricsOutput/$TMP_FOLDER
rm -Rf data/$TMP_FOLDER
rm -Rf data/${TMP_FOLDER}_hires
rm -Rf exp_asru_PHON/chain/cnn-tdnn_sp/ali_$TMP_FOLDER
rm -Rf exp_asru_PHON/make_mfcc/$TMP_FOLDER
rm -f mfcc/raw_mfcc_$TMP_FOLDER.1.ark
rm -f mfcc/raw_mfcc_$TMP_FOLDER.1.scp
rm -f mfcc/cmvn_$TMP_FOLDER.ark
rm -f mfcc/cmvn_$TMP_FOLDER.scp

echo "###### DONE!! ######"
echo "The aligned text file is at $3"
echo "####################"
