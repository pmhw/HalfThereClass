# -*- coding: utf-8 -*-
from pathlib import Path

body = Path('backend/src/common/contract.default.md').read_text(encoding='utf-8') if Path('backend/src/common/contract.default.md').exists() else ''
