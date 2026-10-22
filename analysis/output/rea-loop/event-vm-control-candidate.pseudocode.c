
void FUN_0044c601(void)

{
  int iVar1;
  int iVar2;
  int local_c;
  
  iVar1 = FUN_00410999(0x492f90);
  local_c = 0;
  while( true ) {
    if (iVar1 <= local_c) {
      return;
    }
    FUN_004180c1((int *)&DAT_00492f90);
    FUN_0047eac4();
    iVar2 = FUN_00406587(0x492f90);
    if (iVar2 == 0) break;
    local_c = local_c + 1;
  }
  return;
}

