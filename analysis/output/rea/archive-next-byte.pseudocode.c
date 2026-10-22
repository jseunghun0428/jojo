
uint __fastcall FUN_0041faf2(void *param_1)

{
  byte bVar1;
  
  if (DAT_00497af4 == (int *)0x0) {
    DAT_00497af4 = FUN_00419102(param_1,DAT_00497af0,0x400);
    if ((int)DAT_00497af4 < 1) {
      return 0xffffffff;
    }
    DAT_00497aec = DAT_00497af0;
  }
  bVar1 = *DAT_00497aec;
  DAT_00497aec = DAT_00497aec + 1;
  DAT_00497af4 = (int *)((int)DAT_00497af4 + -1);
  return (uint)bVar1;
}

