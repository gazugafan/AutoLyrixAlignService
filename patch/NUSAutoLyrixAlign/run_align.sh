. ./cmd.sh
#. ./path.sh
#. ./utils/parse_options.sh

# Decoding script, adapted from the scripts: run.sh, run_tdnn.sh, and run_ivector_common.sh
# This script only decodes any given test data

feat_nj=1
test_data=$1
expdir=exp_asru_PHON

step_extract_features=1
step_align_dalimore=1

if [ $step_extract_features == 1 ]; then
####################################
## From run.sh: Feature extraction
steps/make_mfcc.sh --nj $feat_nj --cmd "$train_cmd" data/$test_data ${expdir}/make_mfcc/$test_data mfcc || exit 1;
steps/compute_cmvn_stats.sh data/$test_data ${expdir}/make_mfcc/$test_data mfcc || exit 1;

utils/copy_data_dir.sh data/$test_data data/${test_data}_hires
steps/make_mfcc.sh --nj $feat_nj --mfcc-config conf/mfcc_hires.conf \
      --cmd "$train_cmd" data/${test_data}_hires || exit 1;
    steps/compute_cmvn_stats.sh data/${test_data}_hires || exit 1;
    utils/fix_data_dir.sh data/${test_data}_hires
fi

####################################
if [ $step_align_dalimore == 1 ]; then
dir=${expdir}/chain/cnn-tdnn_sp
steps/nnet3/align.sh --nj $feat_nj --cmd "$train_cmd"\
        data/${test_data}_hires data/lang_asru_PHON_final_mirex $dir $dir/ali_${test_data}
frameshift=0.03
steps/get_train_ctm.sh --frame-shift 0.03 data/${test_data}_hires data/lang_asru_PHON_final_mirex $dir/ali_${test_data}
fi
