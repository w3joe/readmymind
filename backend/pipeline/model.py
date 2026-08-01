import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from huggingface_hub import hf_hub_download
import jlens

from pipeline.config import (
    MODEL_ID,
    LENS_REPO,
    LENS_FILENAME,
    MODEL_CACHE,
    LENS_CACHE,
)

_model = None
_tokenizer = None
_jlens_model = None
_lens = None


def get_model_and_lens():
    """Return (hf_model, tokenizer, jlens_model, lens), loading once per process."""
    global _model, _tokenizer, _jlens_model, _lens

    if _model is not None:
        return _model, _tokenizer, _jlens_model, _lens

    print(f"Loading model {MODEL_ID}...")
    _tokenizer = AutoTokenizer.from_pretrained(
        MODEL_ID,
        cache_dir=MODEL_CACHE,
        trust_remote_code=True,
    )

    _model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        cache_dir=MODEL_CACHE,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )
    _model.eval()

    print("Wrapping with jlens...")
    _jlens_model = jlens.from_hf(_model, _tokenizer)

    print(f"Loading J-Lens from {LENS_REPO}/{LENS_FILENAME}...")
    lens_path = hf_hub_download(
        repo_id=LENS_REPO,
        filename=LENS_FILENAME,
        cache_dir=LENS_CACHE,
    )
    _lens = jlens.JacobianLens.load(lens_path)

    print("Model + lens ready.")
    return _model, _tokenizer, _jlens_model, _lens
