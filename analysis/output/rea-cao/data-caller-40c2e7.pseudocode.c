
void __cdecl FUN_0040c2e7(uint param_1,int param_2,int param_3)

{
  char cVar1;
  byte bVar2;
  undefined3 extraout_var;
  undefined3 extraout_var_00;
  uint uVar3;
  undefined1 *puVar4;
  void *this;
  char cVar5;
  bool bVar6;
  byte local_8;
  
  if (0x3ff < param_1) {
    return;
  }
  FUN_004061e4();
  bVar6 = (short)param_2 == -1;
  if ((bVar6) || ((char)param_2 == -1)) {
    if (param_3 == 0) {
      cVar1 = FUN_0042ac58();
      if (CONCAT31(extraout_var,cVar1) == 0) {
        return;
      }
      FUN_0040c436(this);
    }
    FUN_004095b9(this,-1,(char)param_2);
    return;
  }
  if ((param_2 == 0) && (cVar1 = FUN_0042ac58(), CONCAT31(extraout_var_00,cVar1) != 0)) {
    return;
  }
  uVar3 = FUN_0040c231();
  uVar3 = FUN_004123c8(param_3,(byte)uVar3,'\0');
  local_8 = (byte)uVar3;
  if (param_2 != 1) {
    puVar4 = (undefined1 *)FUN_0040159c();
    FUN_0041b51e((uint *)s_DATA_E5_0048bb60,0,puVar4);
    FUN_0046206c(param_1,0x19,0);
  }
  uVar3 = FUN_0040bf0c((int)this);
  bVar2 = (byte)uVar3;
  if (bVar2 < 0x14) {
    cVar1 = bVar2 * '\x03';
  }
  else {
    cVar1 = bVar2 + 0x28;
  }
  if (cVar1 < ';') {
    if (local_8 < 0x28) {
      cVar5 = 0x13 < local_8;
    }
    else {
      cVar5 = '\x02';
    }
    cVar1 = cVar1 + cVar5;
  }
  if (param_2 == 1) {
    if (param_3 == 0x65) goto LAB_0040c425;
    if (*(char *)((int)this + 0x2c) < (char)local_8) {
      local_8 = local_8 - *(char *)((int)this + 0x2c);
      goto LAB_0040c3f5;
    }
  }
  else {
    FUN_0040e012(this,0);
LAB_0040c3f5:
    FUN_0040e01f(this,cVar1);
    FUN_004073f3(this,local_8,0);
  }
  FUN_00407fd4(this,'\0',1);
  FUN_00407fd4(this,'\x01',1);
LAB_0040c425:
  FUN_004095b9(this,'\0',(char)param_2);
  return;
}

