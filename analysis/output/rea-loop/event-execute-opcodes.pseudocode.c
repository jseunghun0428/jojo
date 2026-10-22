
uint __thiscall FUN_00410857(void *this,int param_1,int param_2)

{
  int iVar1;
  uint uVar2;
  void *extraout_ECX;
  void *this_00;
  
  iVar1 = FUN_0042ad2d((int)this);
  if (iVar1 == 0) {
    uVar2 = 4;
  }
  else {
    this_00 = this;
    if (*(int *)((int)this + 0x14) < 0) {
      if (param_2 == 0) {
        *(undefined4 *)((int)this + 0x2c) = 1;
      }
      uVar2 = FUN_0040fcb2((int)this);
      DAT_00500ab4 = uVar2 + *(int *)((int)extraout_ECX + 0xc);
      this_00 = extraout_ECX;
      if (param_1 == 0) {
        FUN_0040fc42(this,uVar2);
        if (param_2 != 0) {
          return 0;
        }
        *(undefined4 *)((int)this + 0x2c) = 0;
        return 0;
      }
    }
    uVar2 = FUN_004105ff(this_00,param_2);
    if ((uVar2 != 2) && (param_2 == 0)) {
      *(undefined4 *)((int)this + 0x2c) = 0;
    }
  }
  return uVar2;
}

