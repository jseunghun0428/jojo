
void FUN_0041648e(int param_1)

{
  char cVar1;
  int iVar2;
  uint *puVar3;
  uint *puVar4;
  char *pcVar5;
  undefined8 uVar6;
  uint local_24 [5];
  uint *local_10;
  
  uVar6 = FUN_00426e64(param_1);
  iVar2 = (int)uVar6;
  local_10 = (uint *)0x4164a6;
  uVar6 = FUN_00426e64(param_1 + (int)((ulonglong)uVar6 >> 0x20) + 1);
  puVar3 = (uint *)uVar6;
  local_10 = (uint *)0x0;
  cVar1 = (char)iVar2;
  if (cVar1 == '\x03') {
    puVar3 = (uint *)((int)puVar3 << 1);
    for (; local_10 <= puVar3; local_10 = (uint *)((int)local_10 + 1)) {
      pcVar5 = s_RS_R__s_EEX_0048b394;
      if (((uint)local_10 & 1) != 0) {
        pcVar5 = s_RS_S__s_EEX_0048b3a0;
      }
      FUN_004196c8((LPSTR)local_24,pcVar5,(uint)local_10 >> 1,2);
      FUN_00416531(local_24,3);
    }
  }
  else if (cVar1 == '\x04') {
    for (; local_10 <= puVar3; local_10 = (uint *)((int)local_10 + 1)) {
      puVar4 = (uint *)FUN_00463d4f(local_10);
      FUN_00416531(puVar4,4);
    }
  }
  else if (cVar1 == '\x01') {
    FUN_00416531(puVar3,iVar2);
  }
  return;
}

