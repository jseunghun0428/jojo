
uint __thiscall FUN_0041fc89(void *this,uint param_1,undefined1 *param_2)

{
  uint uVar1;
  uint local_414;
  uint local_410;
  uint local_40c;
  uint local_14;
  DWORD local_10;
  uint local_c;
  void *local_8;
  
  DAT_00497af0 = &local_414;
  DAT_00497af4 = 0;
  DAT_00497ae8 = 0;
  DAT_00497ae4 = 0;
  local_8 = this;
  FUN_00419184(this,0x118,&local_414,4);
  uVar1 = FUN_0040bad4(0xc);
  if (uVar1 <= param_1) {
    param_1 = 0;
  }
  FUN_00419184(local_8,param_1 * 0xc + 0x110,&local_414,0xc);
  local_c = local_40c >> 0x18 | (local_40c & 0xff0000) >> 8 | (local_40c & 0xff00) << 8 |
            local_40c << 0x18;
  local_10 = local_410 >> 0x18 | (local_410 & 0xff0000) >> 8 | (local_410 & 0xff00) << 8 |
             local_410 << 0x18;
  local_14 = local_414 >> 0x18 | (local_414 & 0xff0000) >> 8 | (local_414 & 0xff00) << 8 |
             local_414 << 0x18;
  if (param_2 != (undefined1 *)0x0) {
    FUN_004191a9(local_8,local_c,0);
    if (local_10 == local_14) {
      FUN_00419102(local_8,param_2,local_10);
    }
    else {
      FUN_0041fbfe(local_8,param_2,local_10);
    }
  }
  return local_10;
}

