
int FUN_00417eea(void)

{
  ushort uVar1;
  undefined2 extraout_var;
  int iVar2;
  DWORD DVar3;
  undefined4 uVar4;
  undefined *puVar5;
  DWORD DVar6;
  char *pcVar7;
  uint local_2c [5];
  int local_18;
  int local_14;
  void *local_10;
  undefined1 *puStack_c;
  int local_8;
  
  puStack_c = &LAB_0048514f;
  local_10 = ExceptionList;
  local_14 = 0;
  local_18 = 0;
  local_8 = 0;
  ExceptionList = &local_10;
  uVar1 = FUN_0043ad32(0x4b0770);
  pcVar7 = s_RS_R__s_EEX_0048b394;
  if ((uVar1 & 1) != 0) {
    pcVar7 = s_RS_S__s_EEX_0048b3a0;
  }
  FUN_004196c8((LPSTR)local_2c,pcVar7,CONCAT22(extraout_var,uVar1) >> 1,2);
  iVar2 = FUN_00418f5c(&local_14,local_2c,0);
  if (iVar2 != 0) {
    DVar3 = FUN_004193c1(&local_14);
    uVar4 = FUN_00480ff0(0);
    puVar5 = (undefined *)FUN_00480fe0(DVar3);
    FUN_00480ff0(uVar4);
    if (puVar5 == (undefined *)0x0) {
      FUN_00408af2(&DAT_00486ef0);
      goto LAB_00417fd3;
    }
    DVar6 = FUN_00419184(&local_14,0,puVar5,DVar3);
    if (DVar6 == DVar3) {
      iVar2 = FUN_0040fe3d(&DAT_00492f90,puVar5);
      if (iVar2 != 0) {
        local_18 = local_18 + 1;
        goto LAB_00417fd3;
      }
    }
    FUN_00481020(puVar5);
  }
  FUN_00408af2(&DAT_0048b3c0);
LAB_00417fd3:
  local_8 = local_8 + -1;
  FUN_004192c5(&local_14);
  ExceptionList = local_10;
  return local_18;
}

