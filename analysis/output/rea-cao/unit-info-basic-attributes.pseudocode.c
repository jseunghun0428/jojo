
void __thiscall FUN_004784f6(void *this,HWND param_1)

{
  char cVar1;
  uint uValue;
  undefined3 extraout_var;
  undefined8 uVar2;
  char local_d8 [148];
  CHAR local_44 [56];
  ushort *local_c;
  uint local_8;
  
  local_c = this;
  for (local_8 = 0; (byte)local_8 < 5; local_8 = local_8 + 1) {
    uValue = FUN_004070e1(local_c,(byte)local_8,1);
    SetDlgItemInt(param_1,local_8 + 0x7d1,uValue,0);
  }
  uVar2 = FUN_00408d38(local_c);
  local_8 = (uint)uVar2;
  if (local_8 < 0x400) {
    FUN_0040bfdb(local_d8,(uint)((ulonglong)uVar2 >> 0x20));
  }
  else {
    local_d8[0] = '\0';
  }
  SetDlgItemTextA(param_1,0x5a6,local_d8);
  cVar1 = FUN_0042ac58();
  if (CONCAT31(extraout_var,cVar1) == 0) {
    local_44[0] = '\0';
  }
  else {
    wsprintfA(local_44,&DAT_0048ebce,(uint)*(byte *)((int)local_c + 0x27),
              (uint)*(ushort *)((int)local_c + 0x35),(uint)*(byte *)((int)local_c + 0x29));
  }
  SetDlgItemTextA(param_1,0x3fc,local_44);
  return;
}

