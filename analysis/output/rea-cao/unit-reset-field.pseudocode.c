
void FUN_0046206c(uint param_1,int param_2,int param_3)

{
  char *pcVar1;
  short *psVar2;
  char cVar3;
  int iVar4;
  int iVar5;
  ushort *extraout_ECX;
  int extraout_ECX_00;
  int extraout_EDX;
  ushort uVar6;
  ushort *puVar7;
  int iVar8;
  int local_8;
  
  local_8 = 0;
  if (param_3 != 2) {
    iVar4 = FUN_0040159c();
    FUN_0041b617(iVar4,param_1,1);
  }
  if ((DAT_00505fac != 0) && (DAT_005083fc != 0)) {
    iVar4 = (uint)DAT_005083fc * param_2;
    FUN_004061e4();
    puVar7 = extraout_ECX;
    for (; iVar8 = iVar4, (byte)local_8 < 5; local_8 = local_8 + 1) {
      while( true ) {
        iVar5 = FUN_0042ac8f((ushort *)&stack0xffffffec,
                             (byte)*(undefined4 *)(local_8 + 0x21 + (int)puVar7),1);
        uVar6 = (ushort)iVar4;
        if (extraout_ECX_00 == 0) break;
        iVar4 = iVar4 - iVar5;
        pcVar1 = (char *)(local_8 + 0x21 + (int)puVar7);
        *pcVar1 = *pcVar1 + '\x01';
        psVar2 = (short *)((int)puVar7 + local_8 * 2 + 0x11);
        *psVar2 = *psVar2 + 1;
      }
      if ((param_3 != 1) && (cVar3 = FUN_0042acd2(1), cVar3 != -1)) {
        FUN_0042ab8e(uVar6,extraout_EDX,puVar7,local_8);
      }
      iVar4 = iVar8;
    }
  }
  return;
}

