
void __fastcall FUN_0046fa82(int param_1)

{
  undefined1 uVar1;
  char cVar2;
  HWND pHVar3;
  undefined4 uVar4;
  undefined3 extraout_var;
  uint uVar5;
  undefined3 extraout_var_00;
  undefined3 extraout_var_01;
  undefined3 uVar6;
  LPCSTR extraout_ECX;
  LPCSTR lpString;
  LPCSTR lpString_00;
  CHAR local_e4 [196];
  uint *local_20;
  LPCSTR local_1c;
  int local_18;
  int local_14;
  uint local_10;
  HWND local_c;
  int local_8;
  
  local_c = *(HWND *)(param_1 + 4);
  local_10 = (uint)*(byte *)(param_1 + 0x24);
  local_14 = *(int *)(param_1 + 0x50);
  local_18 = *(int *)(local_14 + 0x74);
  local_1c = (LPCSTR)0x46fa9a;
  local_8 = param_1;
  FUN_0042420a(param_1,local_14);
  lpString_00 = extraout_ECX;
  local_1c = extraout_ECX;
  pHVar3 = GetDlgItem(local_c,0x522);
  SetWindowTextA(pHVar3,lpString_00);
  pHVar3 = GetDlgItem(local_c,0x526);
  FUN_0046280a((void *)(local_8 + 0x30),pHVar3);
  uVar4 = FUN_00414254((int)local_1c,local_14);
  MoveToXY((void *)(local_8 + 0x30),DAT_00492e10,uVar4);
  FUN_0041426b((int)local_1c,local_14);
  SetDlgItemTextA(local_c,0x3ff,lpString);
  uVar1 = FUN_00425ad0((int)local_1c);
  SetDlgItemInt(local_c,0x3f2,CONCAT31(extraout_var,uVar1),0);
  local_20 = (uint *)FUN_0040154a();
  if (local_1c[0xf] == '(') {
    uVar5 = 0xb;
  }
  else {
    cVar2 = FUN_00418c90((int)local_1c);
    uVar5 = CONCAT31(extraout_var_00,cVar2);
    if (cVar2 == -1) {
      uVar5 = CONCAT31(extraout_var_00,0x10);
    }
  }
  FUN_0046fc61(uVar5,local_20,0xb);
  if (local_1c[0xf] == '(') {
    uVar5 = 0;
  }
  else if (((char)local_18 == '\0') && ((&DAT_004d1570)[local_10] == '\x1a')) {
    uVar5 = 0;
  }
  else {
    cVar2 = FUN_00484e27((int)local_1c);
    uVar5 = CONCAT31(extraout_var_01,cVar2);
    if (cVar2 == -1) {
      uVar5 = CONCAT31(extraout_var_01,0x10);
    }
  }
  FUN_0046fc61(uVar5,local_20,0xc);
  FUN_0041790a(local_c);
  FUN_0040bf81(local_e4,local_18 * 0x90 + local_10);
  pHVar3 = GetDlgItem(local_c,0x525);
  SetWindowTextA(pHVar3,local_e4);
  if ((char)local_18 == '\0') {
    cVar2 = (&DAT_004d1720)[local_10];
    uVar6 = (undefined3)(local_10 >> 8);
    uVar4 = CONCAT31(uVar6,cVar2);
    if (cVar2 == '\0') {
      uVar4 = CONCAT31(uVar6,0x5a);
    }
    else if (cVar2 == '\x01') {
      uVar4 = CONCAT31(uVar6,100);
    }
    else if (cVar2 == '\x02') {
      uVar4 = CONCAT31(uVar6,100);
    }
    else if (cVar2 == '\x03') {
      uVar4 = CONCAT31(uVar6,0x22);
    }
    else if (cVar2 == '\x04') {
      uVar4 = CONCAT31(uVar6,0x32);
    }
  }
  else {
    uVar4 = 100;
  }
  FUN_0041c11e(local_c,0x523,uVar4);
  if ((char)local_18 == '\0') {
    if ((&DAT_004d18d0)[local_10] == '\x04') {
      uVar5 = 0;
    }
    else {
      uVar5 = (uint)(byte)(&DAT_004d1840)[local_10];
      if (0xf9 < (byte)(&DAT_004d1840)[local_10]) {
        uVar5 = 100;
      }
    }
  }
  else {
    uVar5 = 0x96;
  }
  FUN_0041c11e(local_c,0x524,uVar5);
  FUN_0047cae3(0);
  return;
}

