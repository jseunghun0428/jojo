
void FUN_00423e30(int param_1,int param_2,undefined2 param_3)

{
  int iVar1;
  
  iVar1 = FUN_0040be7d(param_1);
  if (param_2 == 0) {
    *(undefined2 *)(&DAT_0050f000 + iVar1 * 2) = param_3;
  }
  else {
    *(undefined2 *)(param_1 + 4) = *(undefined2 *)(&DAT_0050f000 + iVar1 * 2);
  }
  return;
}

