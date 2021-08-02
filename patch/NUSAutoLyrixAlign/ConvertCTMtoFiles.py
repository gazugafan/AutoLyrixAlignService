import os
import sys

ctm_file = 'exp_asru_PHON/chain/cnn-tdnn_sp/ali_' + sys.argv[1] + '/ctm'

outputfolder = 'AlignedLyricsOutput/' + sys.argv[1]

if not os.path.exists(outputfolder):
	os.makedirs(outputfolder)

lines = open(ctm_file,'r').readlines()

filename_old = ''
line_cnt = 1
for line in lines:
	filename,dummy1,start,dur,word = line.replace(' \n','').replace('\n','').split(' ')
	end = str(float(start)+float(dur))
	if filename!=filename_old:
		if line_cnt == 1:
			filename_old = filename
			fout = open(outputfolder+os.sep+'alignedoutput.txt','w')
			fout.write(start+' '+end+' '+word+'\n')
			line_cnt=line_cnt+1
		else:
			fout.close()
			fout = open(outputfolder+os.sep+'alignedoutput.txt','w')
			fout.write(start+' '+end+' '+word+'\n')
			filename_old = filename
			line_cnt=line_cnt+1
	else:
		fout.write(start+' '+end+' '+word+'\n')
		filename_old = filename
		line_cnt=line_cnt+1

fout.close()
