
int __fastcall FUN_00407a37(void *param_1)

{
  undefined1 uVar1;
  bool bVar2;
  undefined1 *puVar3;
  undefined3 extraout_var;
  undefined4 *puVar4;
  void *this;
  undefined4 *local_14;
  undefined1 *puVar5;
  int local_8;
  
  local_8 = 0;
  FUN_0042b81b(0xe);
  puVar3 = (undefined1 *)FUN_004015ee();
  *puVar3 = 5;
  uVar1 = FUN_004065d0(DAT_004cea00);
  puVar3[1] = uVar1;
  puVar3[2] = *(char *)((int)param_1 + 2) + '\x01';
  puVar5 = puVar3;
  FUN_0047fc7d(puVar3 + 5,&DAT_00496ca0);
  local_14 = (undefined4 *)(puVar3 + 0x23);
  bVar2 = FUN_0040b922();
  if (CONCAT31(extraout_var,bVar2) != 0) {
    local_14 = (undefined4 *)FUN_0044f14a(param_1,local_14);
    for (; (byte)local_8 < 0xfa; local_8 = local_8 + 1) {
      FUN_004061f9();
      local_14 = (undefined4 *)FUN_0044f24c(this,local_14);
    }
    local_8 = 0x640;
    puVar4 = (undefined4 *)FUN_0040167e();
    FUN_0047fcfd(puVar4,local_14,0x640);
  }
  return (int)local_14 + (local_8 - (int)puVar5);
}

