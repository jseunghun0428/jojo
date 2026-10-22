
void FUN_0041b666(void)

{
  int iVar1;
  void *this;
  uint uVar2;
  uint uVar3;
  undefined1 *local_8;
  
  local_8 = DAT_00496f60;
  iVar1 = FUN_0041b51e((uint *)s_DATA_E5_0048bb60,0,DAT_00496f60);
  if (iVar1 != 0) {
    uVar2 = 0;
    while (uVar2 < 0x400) {
      iVar1 = 0;
      uVar3 = uVar2;
      FUN_004061e4();
      local_8 = FUN_00408c0c(this,uVar2,local_8,iVar1);
      uVar2 = uVar3 + 1;
    }
  }
  return;
}

