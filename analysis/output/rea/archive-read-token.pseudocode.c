
int __fastcall FUN_0041fa3e(void *param_1)

{
  short sVar1;
  int iVar2;
  uint local_8;
  
  local_8 = 0;
  sVar1 = 0;
  do {
    iVar2 = FUN_0041fa91(param_1,1);
    if (iVar2 == -1) {
      return -1;
    }
    local_8 = iVar2 + local_8 * 2;
    sVar1 = sVar1 + 1;
  } while ((local_8 & 1) != 0);
  iVar2 = FUN_0041fa91(param_1,(int)sVar1);
  if (iVar2 == -1) {
    iVar2 = -1;
  }
  else {
    iVar2 = local_8 + iVar2;
  }
  return iVar2;
}

