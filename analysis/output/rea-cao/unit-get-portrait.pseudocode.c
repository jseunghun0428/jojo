
uint __fastcall FUN_0040765c(ushort *param_1)

{
  ushort uVar1;
  undefined2 extraout_var;
  uint uVar2;
  
  uVar1 = FUN_00482715(param_1);
  uVar2 = (uint)*(ushort *)(&DAT_0050f000 + CONCAT22(extraout_var,uVar1) * 2);
  if (uVar2 != 0) {
    uVar2 = uVar2 + 7;
  }
  return uVar2;
}

