
void __thiscall FUN_0041fbfe(void *this,undefined1 *param_1,int param_2)

{
  int iVar1;
  int iVar2;
  int local_18;
  undefined1 *local_8;
  
  do {
    iVar1 = FUN_0041fa3e(this);
    if (iVar1 < 0x100) {
      *param_1 = *(undefined1 *)((int)this + iVar1 + 4);
      param_1 = param_1 + 1;
      param_2 = param_2 + -1;
    }
    else {
      iVar2 = FUN_0041fa3e(this);
      local_8 = param_1 + -(iVar1 + -0x100);
      for (local_18 = 0; local_18 < iVar2 + 3; local_18 = local_18 + 1) {
        *param_1 = *local_8;
        param_1 = param_1 + 1;
        local_8 = local_8 + 1;
      }
      param_2 = param_2 - (iVar2 + 3);
    }
  } while (param_2 != 0);
  return;
}

