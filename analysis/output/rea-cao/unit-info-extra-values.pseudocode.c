
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_00478664(HWND param_1)

{
  byte bVar1;
  char cVar2;
  HWND pHVar3;
  int iVar4;
  LPCSTR pCVar5;
  undefined3 extraout_var;
  uint uVar6;
  UINT uValue;
  int extraout_ECX;
  ushort *local_80;
  HWND local_7c;
  int iStack_70;
  uint local_c;
  HWND local_8;
  
  pHVar3 = GetDlgItem(param_1,0x403);
  EnableWindow(pHVar3,(uint)(DAT_004b7504 != 0));
  iVar4 = FUN_0047fa89(DAT_004b7504,1,0x200);
  pHVar3 = GetDlgItem(param_1,0x404);
  EnableWindow(pHVar3,(uint)(*(ushort *)(&DAT_004b6cf0 + iVar4 * 4) < 0x400));
  pCVar5 = (LPCSTR)FUN_00407775((int)local_80);
  SetDlgItemTextA(param_1,0x3f6,pCVar5);
  local_8 = GetDlgItem(param_1,0x3f7);
  local_c = FUN_00419b76(local_80);
  if ((char)local_c == -1) {
    iVar4 = 0;
  }
  else {
    FUN_004061f9();
    bVar1 = FUN_00413172(extraout_ECX);
    if (bVar1 < 4) {
      pCVar5 = &DAT_0048ebf1 + CONCAT31(extraout_var,bVar1) * 9;
    }
    else {
      pCVar5 = &DAT_004b7544;
    }
    SetWindowTextA(local_8,pCVar5);
    iVar4 = 5;
  }
  ShowWindow(local_8,iVar4);
  iVar4 = FUN_004358c5((int)local_80);
  s_Resize_00500e3d[6] = '\0';
  if (iVar4 != 0) {
    s_Resize_00500e3d[6] = '+';
  }
  pCVar5 = FUN_0040111a();
  SetDlgItemTextA(param_1,0x3f8,pCVar5);
  pHVar3 = GetDlgItem(param_1,0x3fd);
  FUN_00478a12(pHVar3,(byte)local_c);
  SetDlgItemInt(param_1,0x3f9,(uint)(byte)local_80[0x16],0);
  local_8 = (HWND)FUN_0040154a();
  uVar6 = FUN_0040765c(local_80);
  local_8 = (HWND)FUN_004789d6(uVar6,(uint *)local_8,0x60,0,&DAT_004ac538);
  FUN_0047cae3(1);
  FUN_0047d1ca(7);
  FUN_004016a8(4);
  FUN_0047e09b((byte *)0x0,(HGLOBAL)0x0,0x78,0x78,(byte *)local_8);
  FUN_0047cae3(0);
  FUN_00460863(param_1,0,0x434);
  DAT_00500e28 = local_80;
  local_7c = param_1;
  FUN_00401126((int)&local_80,(byte)DAT_00500ad1);
  FUN_00476eab(local_80,_DAT_004b6ba8);
  FUN_0040f885(pHRam004b6bac);
  FUN_00477b7f(local_80,pHRam004b6bb0);
  FUN_00476973(local_80,param_1);
  FUN_004784f6(local_80,param_1);
  iStack_70 = 0;
  cVar2 = FUN_00411da5((int)local_80);
  if (cVar2 != -1) {
    iStack_70 = iStack_70 + 5;
  }
  pHVar3 = GetDlgItem(param_1,0x3fa);
  ShowWindow(pHVar3,iStack_70);
  pHVar3 = GetDlgItem(param_1,0x3fb);
  ShowWindow(pHVar3,iStack_70);
  if (iStack_70 != 0) {
    uValue = FUN_0040e1d0();
    SetDlgItemInt(param_1,0x3fb,uValue,0);
  }
  return;
}

